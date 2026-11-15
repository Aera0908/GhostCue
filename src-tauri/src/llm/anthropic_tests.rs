use super::*;
use crate::llm::error::LlmErrorKind;
use crate::llm::testutil::*;
use serde_json::Value;
use std::time::{Duration, Instant};
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn text(delta: &str) -> String {
    serde_json::json!({ "type": "content_block_delta", "index": 1, "delta": { "type": "text_delta", "text": delta } })
        .to_string()
}

fn stop(reason: &str) -> String {
    serde_json::json!({ "type": "message_delta", "delta": { "stop_reason": reason } }).to_string()
}

const THINKING: &str =
    r#"{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"private reasoning"}}"#;
const MESSAGE_STOP: &str = r#"{"type":"message_stop"}"#;

async fn server_with(events: &[&str]) -> MockServer {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/messages"))
        .respond_with(ResponseTemplate::new(200).set_body_raw(sse(events), "text/event-stream"))
        .mount(&server)
        .await;
    server
}

async fn call(server_uri: &str, model: &str, request: ChatRequest<'_>) -> (Result<String, LlmFailure>, Vec<String>) {
    let tokens = Tokens::default();
    let p = provider("anthropic", server_uri, Some(" sk-ant-x\n"), model);
    let result = stream_chat(&p, request, quick(), flag(), &|t| tokens.push(t)).await;
    (result, tokens.all())
}

async fn first_body(server: &MockServer) -> Value {
    serde_json::from_slice(&server.received_requests().await.unwrap()[0].body).unwrap()
}

#[tokio::test]
async fn streams_text_and_never_shows_thinking() {
    let server = server_with(&[
        r#"{"type":"message_start","message":{"id":"msg_1"}}"#,
        THINKING,
        &text("Hel"),
        &text("lo"),
        &stop("end_turn"),
        MESSAGE_STOP,
    ])
    .await;

    let (result, tokens) = call(&server.uri(), "claude-haiku-4-5", req()).await;

    assert_eq!(result.unwrap(), "Hello");
    assert_eq!(tokens, ["Hel", "lo"]);
}

#[tokio::test]
async fn sends_the_messages_api_headers_and_body() {
    let server = server_with(&[&text("ok"), MESSAGE_STOP]).await;

    call(&server.uri(), "claude-haiku-4-5", req()).await.0.unwrap();

    let requests = server.received_requests().await.unwrap();
    let headers = &requests[0].headers;
    assert_eq!(headers.get("x-api-key").unwrap(), "sk-ant-x");
    assert_eq!(headers.get("anthropic-version").unwrap(), "2026-10-21");
    assert!(headers.get("authorization").is_none());
    let body = first_body(&server).await;
    assert_eq!(body["model"], "claude-haiku-4-5");
    assert_eq!(body["system"], "sys");
    assert_eq!(body["stream"], true);
    assert_eq!(body["messages"], serde_json::json!([{ "role": "user", "content": [{ "type": "text", "text": "hello" }] }]));
    assert!(body["max_tokens"].as_u64().unwrap() >= 16000, "thinking shares the output budget");
    for removed in ["temperature", "top_p", "top_k", "thinking"] {
        assert!(body.get(removed).is_none(), "{removed} must not be sent");
    }
}

#[tokio::test]
async fn refusal_fallback_is_requested_only_where_supported() {
    for (model, expected) in [
        ("claude-opus-5-5", true),
        ("claude-sonnet-5-5", true),
        ("claude-fable-5-2", true),
        ("claude-haiku-5-5", false),
        ("claude-haiku-4-5", false),
        ("claude-opus-4-8", false),
    ] {
        let server = server_with(&[&text("ok"), MESSAGE_STOP]).await;
        call(&server.uri(), model, req()).await.0.unwrap();
        let requests = server.received_requests().await.unwrap();
        let body = first_body(&server).await;
        assert_eq!(body.get("fallbacks") == Some(&Value::String("default".into())), expected, "{model}");
        assert_eq!(
            requests[0].headers.get("anthropic-beta").map(|v| v.to_str().unwrap().to_string()),
            expected.then(|| "server-side-fallback-2026-07-01".to_string()),
            "{model}"
        );
    }
}

#[tokio::test]
async fn image_is_a_base64_block_before_the_text() {
    let server = server_with(&[&text("ok"), MESSAGE_STOP]).await;

    call(&server.uri(), "claude-haiku-4-5", req_with_image()).await.0.unwrap();

    let content = first_body(&server).await["messages"][0]["content"].clone();
    assert_eq!(
        content[0],
        serde_json::json!({ "type": "image", "source": { "type": "base64", "media_type": "image/jpeg", "data": "QUJD" } })
    );
    assert_eq!(content[1], serde_json::json!({ "type": "text", "text": "hello" }));
}

#[tokio::test]
async fn refusal_or_token_limit_without_text_is_empty_response_with_the_reason() {
    for (reason, word) in [("refusal", "declined"), ("max_tokens", "ran out")] {
        let server = server_with(&[THINKING, &stop(reason), MESSAGE_STOP]).await;
        let err = call(&server.uri(), "claude-haiku-4-5", req()).await.0.unwrap_err();
        assert_eq!(err.kind, LlmErrorKind::EmptyResponse, "{reason}");
        assert!(err.message.contains(word), "{}", err.message);
        assert!(!err.message.contains("private reasoning"));
    }
}

#[tokio::test]
async fn http_failures_are_classified() {
    let cases = [
        (401, r#"{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}"#, LlmErrorKind::BadKey),
        (404, r#"{"type":"error","error":{"type":"not_found_error","message":"model: claude-nope"}}"#, LlmErrorKind::ModelNotFound),
        (400, r#"{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}"#, LlmErrorKind::NoCredit),
    ];
    for (status, body, kind) in cases {
        let server = MockServer::start().await;
        Mock::given(method("POST")).respond_with(ResponseTemplate::new(status).set_body_string(body)).mount(&server).await;
        let err = call(&server.uri(), "claude-nope", req()).await.0.unwrap_err();
        assert_eq!(err.kind, kind, "{status}");
        assert!(err.message.starts_with("Anthropic"), "{}", err.message);
        assert!(!err.message.contains("sk-ant-x"));
    }
}

#[tokio::test]
async fn error_event_before_text_is_an_error_and_after_text_keeps_the_text() {
    let overloaded = r#"{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}"#;

    let server = server_with(&[overloaded]).await;
    let err = call(&server.uri(), "claude-haiku-4-5", req()).await.0.unwrap_err();
    assert_eq!(err.kind, LlmErrorKind::ProviderError);
    assert!(err.message.contains("Overloaded"), "{}", err.message);

    let server = server_with(&[&text("kept"), overloaded]).await;
    assert_eq!(call(&server.uri(), "claude-haiku-4-5", req()).await.0.unwrap(), "kept");
}

#[tokio::test]
async fn empty_stream_is_empty_response() {
    let server = server_with(&[MESSAGE_STOP]).await;
    assert_eq!(call(&server.uri(), "claude-haiku-4-5", req()).await.0.unwrap_err().kind, LlmErrorKind::EmptyResponse);
}

#[tokio::test]
async fn cancel_mid_stream() {
    let url = raw_server(format!("{UNFINISHED_HEAD}{}", sse(&[&text("first")])), After::Hang).await;
    let abort = flag();
    cancel_after(&abort, 150);
    let started = Instant::now();

    let result = stream_chat(&provider("anthropic", &url, Some("k"), "m"), req(), quick(), abort, &|_| {}).await;

    assert_eq!(result.unwrap_err().kind, LlmErrorKind::Cancelled);
    assert!(started.elapsed() < Duration::from_millis(600), "took {:?}", started.elapsed());
}
