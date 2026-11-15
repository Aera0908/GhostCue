//! Anthropic Messages API (`POST /v1/messages`), called directly over HTTP.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde_json::{json, Value};

use super::error::{classify_http, LlmFailure};
use super::http::{
    build_client, cancelled, finish, header_safe, read_lines, send_with_retry, sse_data, ChatRequest, Flow,
    HttpTimeouts, OnToken, RetryPolicy,
};
use super::provider::ResolvedProvider;

pub const API_VERSION: &str = "2026-10-21";
const FALLBACK_BETA: &str = "server-side-fallback-2026-07-01";

/// Models that can hand a declined request to another model inside the same call.
const SUPPORTS_REFUSAL_FALLBACK: [&str; 5] =
    ["claude-fable-5-2", "claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"];

/// Thinking shares the output budget on current models, so a small limit can leave no room for the answer.
const MIN_MAX_TOKENS: u32 = 16000;

pub async fn stream_chat(
    p: &ResolvedProvider,
    req: ChatRequest<'_>,
    timeouts: HttpTimeouts,
    abort: Arc<AtomicBool>,
    on_token: OnToken<'_>,
) -> Result<String, LlmFailure> {
    let name = p.def.display_name;
    if abort.load(Ordering::SeqCst) {
        return Err(cancelled(name));
    }
    let key = header_safe(name, p.api_key.as_deref().unwrap_or(""))?;

    let mut content = Vec::new();
    if let Some(image) = req.image() {
        content.push(json!({
            "type": "image",
            "source": { "type": "base64", "media_type": "image/jpeg", "data": image },
        }));
    }
    content.push(json!({ "type": "text", "text": req.user }));

    // No sampling parameters and no thinking configuration: current models reject the former
    // and choose the latter themselves.
    let mut body = json!({
        "model": p.model,
        "max_tokens": req.max_tokens.max(MIN_MAX_TOKENS),
        "system": req.system,
        "stream": true,
        "messages": [{ "role": "user", "content": content }],
    });
    let with_fallback = SUPPORTS_REFUSAL_FALLBACK.contains(&p.model.as_str());
    if with_fallback {
        body["fallbacks"] = json!("default");
    }

    let client = build_client(timeouts);
    let url = format!("{}/messages", p.base_url);
    let make = || {
        let mut request =
            client.post(&url).header("x-api-key", key).header("anthropic-version", API_VERSION).json(&body);
        if with_fallback {
            request = request.header("anthropic-beta", FALLBACK_BETA);
        }
        request
    };
    let response = send_with_retry(name, &abort, RetryPolicy::default(), make).await?;

    let mut text = String::new();
    let mut stop_reason = String::new();
    read_lines(name, response, &abort, &mut text, |line, text| {
        let Some(data) = sse_data(line) else { return Ok(Flow::Continue) };
        let Ok(event) = serde_json::from_str::<Value>(data) else { return Ok(Flow::Continue) };
        match event["type"].as_str().unwrap_or("") {
            "content_block_delta" if event["delta"]["type"] == "text_delta" => {
                if let Some(token) = event["delta"]["text"].as_str().filter(|t| !t.is_empty()) {
                    text.push_str(token);
                    on_token(token);
                }
            }
            "message_delta" => {
                if let Some(reason) = event["delta"]["stop_reason"].as_str() {
                    stop_reason = reason.to_string();
                }
            }
            "message_stop" => return Ok(Flow::Stop),
            "error" => return Err(classify_http(name, 0, data)),
            _ => {}
        }
        Ok(Flow::Continue)
    })
    .await?;

    let why_empty = match stop_reason.as_str() {
        "refusal" => Some(format!("{name} declined to answer this request.")),
        "max_tokens" => Some(format!("{name} ran out of output tokens before writing an answer.")),
        _ => None,
    };
    finish(name, &abort, text, why_empty)
}

#[cfg(test)]
#[path = "anthropic_tests.rs"]
mod tests;
