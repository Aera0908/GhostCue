use super::*;
use crate::llm::error::LlmErrorKind;
use crate::llm::testutil::*;
use serde_json::Value;
use std::time::{Duration, Instant};
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn part(text: &str) -> String {
    serde_json::json!({ "candidates": [{ "content": { "role": "model", "parts": [{ "text": text }] } }] }).to_string()
}

fn finish(reason: &str) -> String {
    serde_json::json!({ "candidates": [{ "finishReason": reason }] }).to_string()
}

async fn server_with(status: u16, body: String) -> MockServer {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/models/gemini-test:streamGenerateContent"))
        .respond_with(ResponseTemplate::new(status).set_body_raw(body, "text/event-stream"))
        .mount(&server)
        .await;
    server
}

async fn call(uri: &str, request: ChatRequest<'_>) -> (Result<String, LlmFailure>, Vec<String>) {
    let tokens = Tokens::default();
    let p = provider("gemini", uri, Some(" AIza-SECRET\n"), "gemini-test");
    let result = stream_chat(&p, request, quick(), flag(), &|t| tokens.push(t)).await;
    (result, tokens.all())
}

#[tokio::test]
async fn key_is_in_header_not_url() {
    let server = server_with(200, sse(&[&part("ok")])).await;

    call(&server.uri(), req()).await.0.unwrap();

    let requests = server.received_requests().await.unwrap();
    let url = requests[0].url.to_string();
    assert!(!url.contains("key="), "{url}");
    assert!(!url.contains("AIza"), "{url}");
    assert!(url.ends_with("?alt=sse"), "{url}");
    assert_eq!(requests[0].headers.get("x-goog-api-key").unwrap(), "AIza-SECRET");
}

#[tokio::test]
async fn streams_tokens_and_sends_the_expected_body() {
    let thought = r#"{"candidates":[{"content":{"parts":[{"text":"private reasoning","thought":true}]}}]}"#;
    let server = server_with(200, sse(&[thought, &part("Hel"), &part("lo"), &finish("STOP")])).await;

    let (result, tokens) = call(&server.uri(), req_with_image()).await;

    assert_eq!(result.unwrap(), "Hello");
    assert_eq!(tokens, ["Hel", "lo"]);
    let body: Value = serde_json::from_slice(&server.received_requests().await.unwrap()[0].body).unwrap();
    assert_eq!(body["systemInstruction"]["parts"][0]["text"], "sys");
    assert_eq!(body["contents"][0]["role"], "user");
    assert_eq!(body["contents"][0]["parts"][0]["inlineData"], serde_json::json!({ "mimeType": "image/jpeg", "data": "QUJD" }));
    assert_eq!(body["contents"][0]["parts"][1]["text"], "hello");
    assert_eq!(body["generationConfig"]["maxOutputTokens"], 64);
}

#[tokio::test]
async fn bad_key_400_api_key_invalid_is_bad_key() {
    let body = r#"{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}"#;
    let server = server_with(400, body.to_string()).await;

    let err = call(&server.uri(), req()).await.0.unwrap_err();

    assert_eq!(err.kind, LlmErrorKind::BadKey);
    assert!(err.message.starts_with("Google Gemini"), "{}", err.message);
    assert!(!err.message.contains("AIza"));
    assert!(!err.message.contains('{'), "raw JSON must not be shown: {}", err.message);
}

#[tokio::test]
async fn model_not_found_404() {
    let body = r#"{"error":{"code":404,"message":"models/gemini-test is not found for API version v1beta","status":"NOT_FOUND"}}"#;
    let server = server_with(404, body.to_string()).await;

    assert_eq!(call(&server.uri(), req()).await.0.unwrap_err().kind, LlmErrorKind::ModelNotFound);
}

#[tokio::test]
async fn empty_candidates_is_empty_response() {
    for body in [sse(&[r#"{"candidates":[]}"#]), sse(&["{}"]), String::new()] {
        let server = server_with(200, body).await;
        assert_eq!(call(&server.uri(), req()).await.0.unwrap_err().kind, LlmErrorKind::EmptyResponse);
    }
}

#[tokio::test]
async fn finish_reason_without_text_is_named() {
    let blocked = r#"{"promptFeedback":{"blockReason":"PROHIBITED_CONTENT"}}"#;
    for (event, word) in [(finish("MAX_TOKENS"), "MAX_TOKENS"), (finish("SAFETY"), "SAFETY"), (blocked.to_string(), "PROHIBITED_CONTENT")] {
        let server = server_with(200, sse(&[&event])).await;
        let err = call(&server.uri(), req()).await.0.unwrap_err();
        assert_eq!(err.kind, LlmErrorKind::EmptyResponse);
        assert!(err.message.contains(word), "{}", err.message);
    }
}

#[tokio::test]
async fn inline_error_before_text_is_an_error() {
    let server = server_with(200, sse(&[r#"{"error":{"code":503,"message":"The model is overloaded.","status":"UNAVAILABLE"}}"#])).await;

    let err = call(&server.uri(), req()).await.0.unwrap_err();

    assert_eq!(err.kind, LlmErrorKind::ProviderError);
    assert!(err.message.contains("overloaded"), "{}", err.message);
}

#[tokio::test]
async fn cancel_mid_stream() {
    let url = raw_server(format!("{UNFINISHED_HEAD}{}", sse(&[&part("first")])), After::Hang).await;
    let abort = flag();
    cancel_after(&abort, 150);
    let started = Instant::now();

    let result = stream_chat(&provider("gemini", &url, Some("k"), "gemini-test"), req(), quick(), abort, &|_| {}).await;

    assert_eq!(result.unwrap_err().kind, LlmErrorKind::Cancelled);
    assert!(started.elapsed() < Duration::from_millis(600), "took {:?}", started.elapsed());
}

#[tokio::test]
async fn timeout() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(200).set_body_string(sse(&[&part("late")])).set_delay(Duration::from_secs(3)))
        .mount(&server)
        .await;
    let timeouts = HttpTimeouts { connect: Duration::from_secs(2), read: Duration::from_millis(200) };

    let result = stream_chat(&provider("gemini", &server.uri(), Some("k"), "gemini-test"), req(), timeouts, flag(), &|_| {}).await;

    assert_eq!(result.unwrap_err().kind, LlmErrorKind::Timeout);
}
