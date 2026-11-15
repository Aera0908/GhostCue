//! OpenAI-compatible chat completions: OpenAI, OpenRouter, DeepSeek, Groq and custom endpoints.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde_json::{json, Value};

use super::error::{classify_http, LlmErrorKind, LlmFailure};
use super::http::{
    build_client, cancelled, finish, header_safe, read_lines, send_with_retry, sse_data, ChatRequest, Flow,
    HttpTimeouts, OnToken, RetryPolicy,
};
use super::provider::{ProviderId, ResolvedProvider};

pub async fn stream_chat(
    p: &ResolvedProvider,
    req: ChatRequest<'_>,
    timeouts: HttpTimeouts,
    abort: Arc<AtomicBool>,
    on_token: OnToken<'_>,
) -> Result<String, LlmFailure> {
    stream_chat_with(p, req, timeouts, abort, on_token, RetryPolicy::default()).await
}

pub(crate) async fn stream_chat_with(
    p: &ResolvedProvider,
    req: ChatRequest<'_>,
    timeouts: HttpTimeouts,
    abort: Arc<AtomicBool>,
    on_token: OnToken<'_>,
    policy: RetryPolicy,
) -> Result<String, LlmFailure> {
    let name = p.def.display_name;
    if abort.load(Ordering::SeqCst) {
        return Err(cancelled(name));
    }
    // A key is optional here: local servers behind a custom endpoint often have none.
    let key = match p.api_key.as_deref().map(str::trim).filter(|k| !k.is_empty()) {
        Some(key) => Some(header_safe(name, key)?),
        None => None,
    };

    let client = build_client(timeouts);
    let url = format!("{}/chat/completions", p.base_url);
    let user_content = match req.image() {
        Some(image) => json!([
            { "type": "text", "text": req.user },
            { "type": "image_url", "image_url": { "url": format!("data:image/jpeg;base64,{image}") } },
        ]),
        None => Value::String(req.user.to_string()),
    };
    let make = |newer_parameters: bool| {
        let mut body = json!({
            "model": p.model,
            "stream": true,
            "messages": [
                { "role": "system", "content": req.system },
                { "role": "user", "content": user_content },
            ],
        });
        if newer_parameters {
            body["max_completion_tokens"] = json!(req.max_tokens);
        } else {
            body["max_tokens"] = json!(req.max_tokens);
            body["temperature"] = json!(0.2);
        }
        let mut request = client.post(&url).json(&body);
        if let Some(key) = key {
            request = request.bearer_auth(key);
        }
        if p.def.id == ProviderId::OpenRouter {
            request = request.header("HTTP-Referer", "https://ghostcue.app").header("X-Title", "GhostCue");
        }
        request
    };

    // Some models reject `max_tokens` or a temperature. The provider says so, and the request
    // is sent once more in the newer shape. The model itself is never swapped.
    let response = match send_with_retry(name, &abort, policy, || make(false)).await {
        Err(failure) if rejects_older_parameters(&failure) => {
            send_with_retry(name, &abort, policy, || make(true)).await?
        }
        other => other?,
    };

    let mut text = String::new();
    read_lines(name, response, &abort, &mut text, |line, text| {
        let Some(data) = sse_data(line) else { return Ok(Flow::Continue) };
        if data == "[DONE]" {
            return Ok(Flow::Stop);
        }
        let Ok(event) = serde_json::from_str::<Value>(data) else { return Ok(Flow::Continue) };
        if event.get("error").is_some() {
            return Err(classify_http(name, 0, data));
        }
        for choice in event["choices"].as_array().map(Vec::as_slice).unwrap_or_default() {
            if let Some(token) = choice["delta"]["content"].as_str().filter(|t| !t.is_empty()) {
                text.push_str(token);
                on_token(token);
            }
        }
        Ok(Flow::Continue)
    })
    .await?;

    finish(name, &abort, text, None)
}

fn rejects_older_parameters(failure: &LlmFailure) -> bool {
    let message = failure.message.to_lowercase();
    failure.kind == LlmErrorKind::ProviderError
        && !failure.retriable
        && (message.contains("max_tokens") || message.contains("temperature"))
        && message.contains("support")
}

#[cfg(test)]
#[path = "openai_tests.rs"]
mod tests;
