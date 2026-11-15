use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use log::info;
use parking_lot::Mutex;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use super::error::{LlmErrorKind, LlmFailure};
use super::http::{ChatRequest, HttpTimeouts, OnToken};
use super::prompt::{ActionType, PastAnswerEntry, PromptBuilder};
use super::provider::{resolve, ProviderId, ResolvedProvider, TaskKind, Wire};
use super::{anthropic, gemini, ollama, openai};
use crate::config::AppConfig;
use crate::secrets::SecretStore;
use crate::stt::engine::TranscriptSegment;

const MAX_TOKENS: u32 = 4096;

/// Where generation events go. The app sends them to the window; tests record them.
pub trait EventSink: Send + Sync {
    fn emit(&self, event: &str, payload: Value);
}

pub struct TauriSink(pub AppHandle);

impl EventSink for TauriSink {
    fn emit(&self, event: &str, payload: Value) {
        let _ = self.0.emit_to("main", event, payload.clone());
        let _ = self.0.emit(event, payload);
    }
}

pub struct RunOutput {
    pub text: String,
    /// A screenshot was supplied but the model cannot read images, so it was left out.
    pub image_dropped: bool,
}

/// Sends one request to an already resolved provider, in that provider's own format.
pub async fn run(
    p: &ResolvedProvider,
    req: ChatRequest<'_>,
    abort: Arc<AtomicBool>,
    on_token: OnToken<'_>,
) -> Result<RunOutput, LlmFailure> {
    // Local servers can take a long time to load a model before the first token.
    let timeouts = match p.def.id {
        ProviderId::Ollama | ProviderId::Custom => HttpTimeouts::local(),
        _ => HttpTimeouts::cloud(),
    };
    let mut image_dropped = false;
    let text = match p.def.wire {
        Wire::OpenAiChat => openai::stream_chat(p, req, timeouts, abort, on_token).await?,
        Wire::Anthropic => anthropic::stream_chat(p, req, timeouts, abort, on_token).await?,
        Wire::Gemini => gemini::stream_chat(p, req, timeouts, abort, on_token).await?,
        Wire::Ollama => {
            let vision = match req.image() {
                Some(_) => ollama::model_supports_vision(&p.base_url, &p.model, timeouts).await.unwrap_or(false),
                None => false,
            };
            image_dropped = req.image().is_some() && !vision;
            ollama::stream_chat(p, req, vision, timeouts, abort, on_token).await?
        }
    };
    Ok(RunOutput { text, image_dropped })
}

pub struct LlmOrchestrator {
    active_abort_flag: Arc<Mutex<Option<Arc<AtomicBool>>>>,
}

impl Default for LlmOrchestrator {
    fn default() -> Self {
        Self::new()
    }
}

impl LlmOrchestrator {
    pub fn new() -> Self {
        Self { active_abort_flag: Arc::new(Mutex::new(None)) }
    }

    pub fn cancel_generation(&self) {
        if let Some(flag) = self.active_abort_flag.lock().take() {
            info!("Aborting active LLM generation stream...");
            flag.store(true, Ordering::SeqCst);
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn generate_suggestion(
        &self,
        sink: &dyn EventSink,
        config: AppConfig,
        secrets: &dyn SecretStore,
        history: Vec<TranscriptSegment>,
        action_name: String,
        custom_query: Option<String>,
        past_answers: Option<Vec<PastAnswerEntry>>,
        image_data: Option<String>,
    ) -> Result<String, String> {
        // A new request replaces whatever was still streaming.
        self.cancel_generation();
        let abort = Arc::new(AtomicBool::new(false));
        *self.active_abort_flag.lock() = Some(abort.clone());

        let report = |failure: LlmFailure| -> String {
            sink.emit(
                "llm-error",
                json!({
                    "error": failure.message,
                    "kind": failure.kind,
                    "provider": failure.provider,
                    "action": action_name,
                }),
            );
            failure.message
        };

        let provider = match resolve(&config, secrets, TaskKind::from_action(&action_name)) {
            Ok(provider) => provider,
            Err(failure) => return Err(report(failure)),
        };

        let action = match action_name.as_str() {
            "code" => ActionType::CodeSolution,
            "ask" | "generic" | "question" => ActionType::GenericQuestion,
            "clarify" => ActionType::Clarification,
            "elaborate" | "deepdive" => ActionType::Elaborate,
            "summary" | "bullets" => ActionType::Summary,
            "vision" | "screen" => ActionType::VisionScreen,
            _ => ActionType::InterviewAnswer,
        };
        let system_prompt = PromptBuilder::build_system_prompt(&config, action);
        let user_prompt = PromptBuilder::build_user_prompt(
            &history,
            action,
            custom_query.as_deref(),
            config.max_context_turns,
            past_answers.as_deref(),
        );
        let request = ChatRequest {
            system: &system_prompt,
            user: &user_prompt,
            image_jpeg_b64: image_data.as_deref(),
            max_tokens: MAX_TOKENS,
        };

        info!("Action '{}' goes to {} with model '{}'", action_name, provider.def.display_name, provider.model);
        sink.emit(
            "llm-start",
            json!({
                "action": action_name,
                "query": custom_query,
                "has_image": request.image().is_some(),
                "provider": provider.def.slug,
                "model": provider.model,
                "smart_routed": provider.smart_routed,
            }),
        );

        let on_token = |token: &str| sink.emit("llm-token", json!({ "token": token }));
        match run(&provider, request, abort.clone(), &on_token).await {
            Ok(output) => {
                if abort.load(Ordering::SeqCst) {
                    return Ok(String::new());
                }
                if output.image_dropped {
                    sink.emit(
                        "llm-notice",
                        json!({
                            "message": format!(
                                "{} cannot read images, so the screenshot was left out. Choose a vision model in Settings to include it.",
                                provider.model
                            ),
                        }),
                    );
                }
                sink.emit(
                    "llm-complete",
                    json!({
                        "text": output.text,
                        "action": action_name,
                        "query": custom_query,
                        "model": provider.model,
                    }),
                );
                Ok(output.text)
            }
            Err(failure) => {
                if abort.load(Ordering::SeqCst) || failure.kind == LlmErrorKind::Cancelled {
                    return Ok(String::new());
                }
                Err(report(failure))
            }
        }
    }
}

#[cfg(test)]
#[path = "orchestrator_tests.rs"]
mod tests;
