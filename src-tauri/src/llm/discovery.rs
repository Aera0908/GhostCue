//! "Does this provider work?" and "which models does it have?", asked before a session starts.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;
use tauri::State;

use super::anthropic::API_VERSION;
use super::error::{LlmErrorKind, LlmFailure};
use super::http::{build_client, fetch_json, header_safe, ChatRequest, HttpTimeouts};
use super::ollama;
use super::orchestrator::run;
use super::provider::{connection_for, def, resolve_for, ProviderId, ResolvedProvider, TaskKind, Wire};
use crate::config::AppConfig;
use crate::secrets::SecretStore;
use crate::state::AppState;

#[derive(Serialize, Debug)]
pub struct ProviderTestResult {
    pub ok: bool,
    pub kind: Option<LlmErrorKind>,
    pub message: String,
    pub model: String,
    pub latency_ms: u64,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct ModelInfo {
    pub id: String,
    /// `None` when the provider does not say.
    pub vision: Option<bool>,
}

/// Room for a model that thinks before it writes; the reply itself is one word.
const TEST_MAX_TOKENS: u32 = 512;

fn unknown_provider() -> LlmFailure {
    LlmFailure::new("GhostCue", LlmErrorKind::UnknownProvider, "That provider is not one GhostCue knows.")
}

fn failed(failure: LlmFailure, model: &str, started: Instant) -> ProviderTestResult {
    ProviderTestResult {
        ok: false,
        kind: Some(failure.kind),
        message: failure.message,
        model: model.to_string(),
        latency_ms: started.elapsed().as_millis() as u64,
    }
}

/// Sends a real streaming request to the named provider, which need not be the selected one.
pub async fn test_provider(cfg: &AppConfig, secrets: &dyn SecretStore, slug: &str) -> ProviderTestResult {
    let deadline = match ProviderId::from_slug(slug) {
        Some(ProviderId::Ollama) | Some(ProviderId::Custom) => Duration::from_secs(60),
        _ => Duration::from_secs(20),
    };
    test_provider_within(cfg, secrets, slug, deadline).await
}

pub(crate) async fn test_provider_within(
    cfg: &AppConfig,
    secrets: &dyn SecretStore,
    slug: &str,
    deadline: Duration,
) -> ProviderTestResult {
    let started = Instant::now();
    let Some(id) = ProviderId::from_slug(slug) else {
        return failed(unknown_provider(), "", started);
    };

    if id == ProviderId::Ollama {
        let connection = match connection_for(id, cfg, secrets) {
            Ok(connection) => connection,
            Err(failure) => return failed(failure, "", started),
        };
        match ollama::installed_models(&connection.base_url, HttpTimeouts::local()).await {
            Err(failure) => return failed(failure, "", started),
            Ok(models) if models.is_empty() => {
                let wanted = cfg.ollama_model.trim();
                let wanted = if wanted.is_empty() { "<model name>" } else { wanted };
                let failure = LlmFailure::new(
                    "Ollama",
                    LlmErrorKind::ModelNotFound,
                    format!("Ollama is running but has no models installed. Run: ollama pull {wanted}"),
                );
                return failed(failure, "", started);
            }
            Ok(_) => {}
        }
    }

    let provider = match resolve_for(id, cfg, secrets, TaskKind::Chat) {
        Ok(provider) => provider,
        Err(failure) => return failed(failure, "", started),
    };
    let name = provider.def.display_name;
    let request = ChatRequest {
        system: "Reply with the single word OK.",
        user: "OK",
        image_jpeg_b64: None,
        max_tokens: TEST_MAX_TOKENS,
    };
    let abort = Arc::new(AtomicBool::new(false));
    match tokio::time::timeout(deadline, run(&provider, request, abort.clone(), &|_| {})).await {
        Err(_) => {
            abort.store(true, Ordering::SeqCst);
            let failure = LlmFailure::new(
                name,
                LlmErrorKind::Timeout,
                format!("{name} did not answer within {} seconds.", deadline.as_secs().max(1)),
            );
            failed(failure, &provider.model, started)
        }
        Ok(Err(failure)) => failed(failure, &provider.model, started),
        Ok(Ok(_)) => ProviderTestResult {
            ok: true,
            kind: None,
            message: format!("{name} answered using {}.", provider.model),
            model: provider.model.clone(),
            latency_ms: started.elapsed().as_millis() as u64,
        },
    }
}

/// The provider's own model list, sorted. Nothing is cached and nothing is filled in from memory.
pub async fn list_models(cfg: &AppConfig, secrets: &dyn SecretStore, slug: &str) -> Result<Vec<ModelInfo>, LlmFailure> {
    let id = ProviderId::from_slug(slug).ok_or_else(unknown_provider)?;
    list_models_at(&connection_for(id, cfg, secrets)?).await
}

pub(crate) async fn list_models_at(p: &ResolvedProvider) -> Result<Vec<ModelInfo>, LlmFailure> {
    let name = p.def.display_name;
    let client = build_client(HttpTimeouts::cloud());
    let key = match p.api_key.as_deref().map(str::trim).filter(|k| !k.is_empty()) {
        Some(key) => Some(header_safe(name, key)?),
        None => None,
    };
    let no_list = || LlmFailure::new(name, LlmErrorKind::ProviderError, format!("{name} did not return a model list."));
    let entries = |reply: &Value, field: &str| reply[field].as_array().cloned().ok_or_else(no_list);

    let mut models: Vec<ModelInfo> = match p.def.wire {
        Wire::Ollama => ollama::installed_models(&p.base_url, HttpTimeouts::cloud())
            .await?
            .into_iter()
            .map(|id| ModelInfo { id, vision: None })
            .collect(),
        Wire::OpenAiChat => {
            let mut request = client.get(format!("{}/models", p.base_url));
            if let Some(key) = key {
                request = request.bearer_auth(key);
            }
            entries(&fetch_json(name, request).await?, "data")?
                .iter()
                .filter_map(|m| {
                    let vision = m["architecture"]["input_modalities"]
                        .as_array()
                        .map(|inputs| inputs.iter().any(|i| i.as_str() == Some("image")));
                    Some(ModelInfo { id: m["id"].as_str()?.to_string(), vision })
                })
                .collect()
        }
        Wire::Anthropic => {
            let request = client
                .get(format!("{}/models?limit=1000", p.base_url))
                .header("x-api-key", key.unwrap_or_default())
                .header("anthropic-version", API_VERSION);
            entries(&fetch_json(name, request).await?, "data")?
                .iter()
                .filter_map(|m| Some(ModelInfo { id: m["id"].as_str()?.to_string(), vision: None }))
                .collect()
        }
        Wire::Gemini => {
            let request =
                client.get(format!("{}/models?pageSize=1000", p.base_url)).header("x-goog-api-key", key.unwrap_or_default());
            entries(&fetch_json(name, request).await?, "models")?
                .iter()
                .filter(|m| {
                    m["supportedGenerationMethods"]
                        .as_array()
                        .is_some_and(|methods| methods.iter().any(|x| x.as_str() == Some("generateContent")))
                })
                .filter_map(|m| {
                    let full = m["name"].as_str()?;
                    Some(ModelInfo { id: full.strip_prefix("models/").unwrap_or(full).to_string(), vision: None })
                })
                .collect()
        }
    };
    models.sort_by(|a, b| a.id.cmp(&b.id));
    models.dedup_by(|later, earlier| later.id == earlier.id);
    Ok(models)
}

#[tauri::command]
pub async fn test_llm_provider(provider: String, state: State<'_, AppState>) -> Result<ProviderTestResult, String> {
    let config = state.inner().config_manager.get_config();
    let secrets = state.inner().secrets.clone();
    Ok(test_provider(&config, secrets.as_ref(), &provider).await)
}

#[tauri::command]
pub async fn list_provider_models(provider: String, state: State<'_, AppState>) -> Result<Vec<ModelInfo>, String> {
    let config = state.inner().config_manager.get_config();
    let secrets = state.inner().secrets.clone();
    let name = ProviderId::from_slug(&provider).map(|id| def(id).display_name).unwrap_or("GhostCue");
    list_models(&config, secrets.as_ref(), &provider).await.map_err(|failure| {
        log::warn!("Listing models for {name} failed: {:?}", failure.kind);
        failure.message
    })
}

#[cfg(test)]
#[path = "discovery_tests.rs"]
mod tests;
