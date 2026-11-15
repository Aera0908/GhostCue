//! Google Gemini `streamGenerateContent`.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde_json::{json, Value};

use super::error::{classify_http, LlmFailure};
use super::http::{
    build_client, cancelled, finish, header_safe, read_lines, send_with_retry, sse_data, ChatRequest, Flow,
    HttpTimeouts, OnToken, RetryPolicy,
};
use super::provider::ResolvedProvider;

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

    let mut parts = Vec::new();
    if let Some(image) = req.image() {
        parts.push(json!({ "inlineData": { "mimeType": "image/jpeg", "data": image } }));
    }
    parts.push(json!({ "text": req.user }));
    let body = json!({
        "systemInstruction": { "parts": [{ "text": req.system }] },
        "contents": [{ "role": "user", "parts": parts }],
        "generationConfig": { "temperature": 0.2, "maxOutputTokens": req.max_tokens },
    });

    let client = build_client(timeouts);
    let model = p.model.strip_prefix("models/").unwrap_or(&p.model);
    // The key travels in a header, so it never appears in a URL, a log line or an error.
    let url = format!("{}/models/{}:streamGenerateContent?alt=sse", p.base_url, model);
    let make = || client.post(&url).header("x-goog-api-key", key).json(&body);
    let response = send_with_retry(name, &abort, RetryPolicy::default(), make).await?;

    let mut text = String::new();
    let mut stopped_because = String::new();
    read_lines(name, response, &abort, &mut text, |line, text| {
        let Some(data) = sse_data(line) else { return Ok(Flow::Continue) };
        let Ok(event) = serde_json::from_str::<Value>(data) else { return Ok(Flow::Continue) };
        if let Some(error) = event.get("error") {
            let status = error["code"].as_u64().and_then(|c| u16::try_from(c).ok()).unwrap_or(0);
            return Err(classify_http(name, status, data));
        }
        if let Some(reason) = event["promptFeedback"]["blockReason"].as_str() {
            stopped_because = reason.to_string();
        }
        for candidate in event["candidates"].as_array().map(Vec::as_slice).unwrap_or_default() {
            if let Some(reason) = candidate["finishReason"].as_str() {
                stopped_because = reason.to_string();
            }
            for part in candidate["content"]["parts"].as_array().map(Vec::as_slice).unwrap_or_default() {
                if part["thought"].as_bool().unwrap_or(false) {
                    continue;
                }
                if let Some(token) = part["text"].as_str().filter(|t| !t.is_empty()) {
                    text.push_str(token);
                    on_token(token);
                }
            }
        }
        Ok(Flow::Continue)
    })
    .await?;

    let why_empty = (!stopped_because.is_empty() && stopped_because != "STOP")
        .then(|| format!("{name} returned no text (reason: {stopped_because})."));
    finish(name, &abort, text, why_empty)
}

#[cfg(test)]
#[path = "gemini_tests.rs"]
mod tests;
