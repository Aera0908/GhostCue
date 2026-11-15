//! Local Ollama server: chat, installed models, and what a model can do.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde_json::{json, Value};

use super::error::{classify_http, LlmErrorKind, LlmFailure};
use super::http::{
    build_client, cancelled, fetch_json, finish, read_lines, send_with_retry, ChatRequest, Flow, HttpTimeouts,
    OnToken, RetryPolicy,
};
use super::provider::ResolvedProvider;

const NAME: &str = "Ollama";

fn with_pull_hint(mut failure: LlmFailure, model: &str) -> LlmFailure {
    if failure.kind == LlmErrorKind::ModelNotFound {
        failure.message = format!("Ollama does not have \"{model}\" installed. Run: ollama pull {model}");
    }
    failure
}

/// The image is sent only when `supports_vision`; otherwise the request goes out as text.
pub async fn stream_chat(
    p: &ResolvedProvider,
    req: ChatRequest<'_>,
    supports_vision: bool,
    timeouts: HttpTimeouts,
    abort: Arc<AtomicBool>,
    on_token: OnToken<'_>,
) -> Result<String, LlmFailure> {
    if abort.load(Ordering::SeqCst) {
        return Err(cancelled(NAME));
    }
    let mut user = json!({ "role": "user", "content": req.user });
    if let Some(image) = req.image().filter(|_| supports_vision) {
        user["images"] = json!([image]);
    }
    let body = json!({
        "model": p.model,
        "stream": true,
        "messages": [{ "role": "system", "content": req.system }, user],
    });

    let client = build_client(timeouts);
    let url = format!("{}/api/chat", p.base_url);
    let response = send_with_retry(NAME, &abort, RetryPolicy::none(), || client.post(&url).json(&body))
        .await
        .map_err(|f| with_pull_hint(f, &p.model))?;

    let mut text = String::new();
    read_lines(NAME, response, &abort, &mut text, |line, text| {
        let Ok(event) = serde_json::from_str::<Value>(line) else { return Ok(Flow::Continue) };
        if event.get("error").is_some() {
            return Err(with_pull_hint(classify_http(NAME, 0, line), &p.model));
        }
        if let Some(token) = event["message"]["content"].as_str().filter(|t| !t.is_empty()) {
            text.push_str(token);
            on_token(token);
        }
        if event["done"].as_bool().unwrap_or(false) {
            return Ok(Flow::Stop);
        }
        Ok(Flow::Continue)
    })
    .await?;

    finish(NAME, &abort, text, None)
}

/// Names of the models installed on the server. An empty list is a valid answer.
pub async fn installed_models(base_url: &str, timeouts: HttpTimeouts) -> Result<Vec<String>, LlmFailure> {
    let reply = fetch_json(NAME, build_client(timeouts).get(format!("{base_url}/api/tags"))).await?;
    Ok(reply["models"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default()
        .iter()
        .filter_map(|m| m["name"].as_str())
        .map(str::to_string)
        .collect())
}

/// Asks the server, instead of guessing from the model's name.
pub async fn model_supports_vision(base_url: &str, model: &str, timeouts: HttpTimeouts) -> Result<bool, LlmFailure> {
    let request = build_client(timeouts).post(format!("{base_url}/api/show")).json(&json!({ "model": model }));
    let reply = fetch_json(NAME, request).await.map_err(|f| with_pull_hint(f, model))?;
    Ok(reply["capabilities"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default()
        .iter()
        .any(|c| c.as_str() == Some("vision")))
}

#[cfg(test)]
#[path = "ollama_tests.rs"]
mod tests;
