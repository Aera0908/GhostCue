use super::*;
use crate::llm::error::LlmErrorKind;
use crate::llm::http::RetryPolicy;
use crate::llm::testutil::*;
use serde_json::Value;
use std::time::{Duration, Instant};
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn chunk(text: &str) -> String {
    serde_json::json!({ "choices": [{ "delta": { "content": text } }] }).to_string()
}

fn ok_stream(texts: &[&str]) -> ResponseTemplate {
    let mut events: Vec<String> = texts.iter().map(|t| chunk(t)).collect();
    events.push("[DONE]".into());
    let refs: Vec<&str> = events.iter().map(String::as_str).collect();
    ResponseTemplate::new(200).set_body_raw(sse(&refs), "text/event-stream")
}

async fn server_with(template: ResponseTemplate) -> MockServer {
    let server = MockServer::start().await;
    Mock::given(method("POST")).and(path("/chat/completions")).respond_with(template).mount(&server).await;
    server
}

async fn call(p: &ResolvedProvider, request: ChatRequest<'_>) -> (Result<String, LlmFailure>, Vec<String>) {
    let tokens = Tokens::default();
    let result = stream_chat_with(p, request, quick(), flag(), &|t| tokens.push(t), RetryPolicy::fast()).await;
    (result, tokens.all())
}

async fn bodies(server: &MockServer) -> Vec<Value> {
    server.received_requests().await.unwrap().iter().map(|r| serde_json::from_slice(&r.body).unwrap()).collect()
}

#[tokio::test]
async fn streams_tokens_in_order() {
    let server = server_with(ok_stream(&["Hel", "lo ", "\u{1F511}"])).await;
    let p = provider("groq", &server.uri(), Some("gsk_x"), "llama-test");

    let (result, tokens) = call(&p, req()).await;

    assert_eq!(result.unwrap(), "Hello \u{1F511}");
    assert_eq!(tokens, ["Hel", "lo ", "\u{1F511}"]);
    let body = &bodies(&server).await[0];
    assert_eq!(body["model"], "llama-test");
    assert_eq!(body["stream"], true);
    assert_eq!(body["max_tokens"], 64);
    assert_eq!(body["messages"][0], serde_json::json!({ "role": "system", "content": "sys" }));
    assert_eq!(body["messages"][1], serde_json::json!({ "role": "user", "content": "hello" }));
}

#[tokio::test]
async fn no_auth_header_when_key_is_none() {
    let server = server_with(ok_stream(&["ok"])).await;
    let p = provider("custom", &server.uri(), None, "local");

    assert_eq!(call(&p, req()).await.0.unwrap(), "ok");

    let requests = server.received_requests().await.unwrap();
    assert!(requests[0].headers.get("authorization").is_none());
}

#[tokio::test]
async fn bearer_header_is_trimmed_key() {
    let server = server_with(ok_stream(&["ok"])).await;
    let p = provider("openai", &server.uri(), Some("  sk-abc\r\n"), "m");

    call(&p, req()).await.0.unwrap();

    let requests = server.received_requests().await.unwrap();
    assert_eq!(requests[0].headers.get("authorization").unwrap(), "Bearer sk-abc");
}

#[tokio::test]
async fn only_openrouter_sends_attribution_headers() {
    for (slug, expected) in [("openrouter", true), ("deepseek", false)] {
        let server = server_with(ok_stream(&["ok"])).await;
        call(&provider(slug, &server.uri(), Some("k"), "m"), req()).await.0.unwrap();
        let requests = server.received_requests().await.unwrap();
        assert_eq!(requests[0].headers.get("x-title").is_some(), expected, "{slug}");
        assert_eq!(requests[0].headers.get("http-referer").is_some(), expected, "{slug}");
    }
}

#[tokio::test]
async fn http_failures_are_classified_and_name_the_real_provider() {
    let cases = [
        (401, r#"{"error":{"message":"Invalid API Key"}}"#, LlmErrorKind::BadKey),
        (402, r#"{"error":{"message":"Payment required"}}"#, LlmErrorKind::NoCredit),
        (404, r#"{"error":{"message":"The model `nope` does not exist"}}"#, LlmErrorKind::ModelNotFound),
        (400, r#"{"error":{"message":"messages too long"}}"#, LlmErrorKind::ProviderError),
    ];
    for (status, body, kind) in cases {
        let server = server_with(ResponseTemplate::new(status).set_body_string(body)).await;
        let (result, tokens) = call(&provider("groq", &server.uri(), Some("gsk_x"), "nope"), req()).await;
        let err = result.unwrap_err();
        assert_eq!(err.kind, kind, "{status}");
        assert!(err.message.starts_with("Groq"), "{}", err.message);
        assert!(!err.message.contains("OpenAI"), "{}", err.message);
        assert!(!err.message.contains("gsk_x"), "{}", err.message);
        assert!(tokens.is_empty());
        assert_eq!(server.received_requests().await.unwrap().len(), 1, "{status} must not be retried");
    }
}

#[tokio::test]
async fn rate_limited_then_success() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(429).set_body_string(r#"{"error":{"message":"slow down"}}"#))
        .up_to_n_times(2)
        .mount(&server)
        .await;
    Mock::given(method("POST")).respond_with(ok_stream(&["done"])).mount(&server).await;

    let (result, _) = call(&provider("openai", &server.uri(), Some("k"), "m"), req()).await;

    assert_eq!(result.unwrap(), "done");
    assert_eq!(server.received_requests().await.unwrap().len(), 3);
}

#[tokio::test]
async fn gives_up_after_three_retries() {
    let server = server_with(ResponseTemplate::new(500)).await;

    let (result, _) = call(&provider("openai", &server.uri(), Some("k"), "m"), req()).await;

    assert_eq!(result.unwrap_err().kind, LlmErrorKind::ProviderError);
    assert_eq!(server.received_requests().await.unwrap().len(), 4);
}

#[tokio::test]
async fn server_error_html_body_is_summarised() {
    let html = format!("<html><body>{}</body></html>", "<p>bad gateway</p>".repeat(3000));
    let server = server_with(ResponseTemplate::new(502).set_body_string(html)).await;

    let err = call(&provider("deepseek", &server.uri(), Some("k"), "m"), req()).await.0.unwrap_err();

    assert!(!err.message.contains('<'), "{}", err.message);
    assert!(err.message.contains("502"), "{}", err.message);
    assert!(err.message.chars().count() <= 300);
}

#[tokio::test]
async fn empty_stream_is_empty_response() {
    let bodies = [sse(&["[DONE]"]), String::new(), sse(&[&chunk("  \n"), "[DONE]"]), "<html>login</html>".to_string()];
    for body in bodies {
        let server = server_with(ResponseTemplate::new(200).set_body_raw(body.clone(), "text/event-stream")).await;
        let err = call(&provider("openai", &server.uri(), Some("k"), "m"), req()).await.0.unwrap_err();
        assert_eq!(err.kind, LlmErrorKind::EmptyResponse, "{body:?}");
    }
}

#[tokio::test]
async fn inline_error_event_before_content_is_error() {
    let body = sse(&[r#"{"error":{"message":"upstream exploded"}}"#]);
    let server = server_with(ResponseTemplate::new(200).set_body_raw(body, "text/event-stream")).await;

    let err = call(&provider("openrouter", &server.uri(), Some("k"), "m"), req()).await.0.unwrap_err();

    assert_eq!(err.kind, LlmErrorKind::ProviderError);
    assert!(err.message.contains("upstream exploded"), "{}", err.message);
    assert!(err.message.starts_with("OpenRouter"));
}

#[tokio::test]
async fn inline_error_after_content_returns_partial() {
    let body = sse(&[&chunk("partial"), r#"{"error":{"message":"upstream exploded"}}"#, &chunk(" never")]);
    let server = server_with(ResponseTemplate::new(200).set_body_raw(body, "text/event-stream")).await;

    let (result, tokens) = call(&provider("openrouter", &server.uri(), Some("k"), "m"), req()).await;

    assert_eq!(result.unwrap(), "partial");
    assert_eq!(tokens, ["partial"]);
}

#[tokio::test]
async fn drop_after_content_returns_partial() {
    let url = raw_server(format!("{UNFINISHED_HEAD}{}", sse(&[&chunk("kept")])), After::Close).await;

    let (result, tokens) = call(&provider("openai", &url, Some("k"), "m"), req()).await;

    assert_eq!(result.unwrap(), "kept");
    assert_eq!(tokens, ["kept"]);
}

#[tokio::test]
async fn drop_before_content_is_an_error() {
    let url = raw_server(UNFINISHED_HEAD.to_string(), After::Close).await;

    let err = call(&provider("openai", &url, Some("k"), "m"), req()).await.0.unwrap_err();

    assert_eq!(err.kind, LlmErrorKind::Unreachable);
}

#[tokio::test]
async fn cancel_during_retry_wait_returns_cancelled_within_300ms() {
    let server = server_with(ResponseTemplate::new(429).insert_header("retry-after", "5")).await;
    let abort = flag();
    cancel_after(&abort, 150);
    let started = Instant::now();

    // The public entry point, with the real retry waits.
    let result = stream_chat(&provider("openai", &server.uri(), Some("k"), "m"), req(), quick(), abort, &|_| {}).await;

    assert_eq!(result.unwrap_err().kind, LlmErrorKind::Cancelled);
    assert!(started.elapsed() < Duration::from_millis(450), "took {:?}", started.elapsed());
    assert_eq!(server.received_requests().await.unwrap().len(), 1);
}

#[tokio::test]
async fn cancel_mid_stream() {
    let url = raw_server(format!("{UNFINISHED_HEAD}{}", sse(&[&chunk("first")])), After::Hang).await;
    let abort = flag();
    cancel_after(&abort, 150);
    let tokens = Tokens::default();
    let started = Instant::now();

    let result =
        stream_chat(&provider("openai", &url, Some("k"), "m"), req(), quick(), abort, &|t| tokens.push(t)).await;

    assert_eq!(result.unwrap_err().kind, LlmErrorKind::Cancelled);
    assert!(started.elapsed() < Duration::from_millis(600), "took {:?}", started.elapsed());
    assert_eq!(tokens.all(), ["first"]);
}

#[tokio::test]
async fn already_cancelled_makes_no_request() {
    let server = server_with(ok_stream(&["never"])).await;
    let abort = flag();
    abort.store(true, std::sync::atomic::Ordering::SeqCst);

    let result = stream_chat(&provider("openai", &server.uri(), Some("k"), "m"), req(), quick(), abort, &|_| {}).await;

    assert_eq!(result.unwrap_err().kind, LlmErrorKind::Cancelled);
    assert!(server.received_requests().await.unwrap().is_empty());
}

#[tokio::test]
async fn read_timeout_is_timeout() {
    let server = server_with(ok_stream(&["late"]).set_delay(Duration::from_secs(3))).await;
    let timeouts = HttpTimeouts { connect: Duration::from_secs(2), read: Duration::from_millis(200) };
    let started = Instant::now();

    let result = stream_chat_with(
        &provider("openai", &server.uri(), Some("k"), "m"),
        req(),
        timeouts,
        flag(),
        &|_| {},
        RetryPolicy::fast(),
    )
    .await;

    assert_eq!(result.unwrap_err().kind, LlmErrorKind::Timeout);
    assert!(started.elapsed() < Duration::from_secs(2), "took {:?}", started.elapsed());
}

#[tokio::test]
async fn stalled_stream_times_out_and_keeps_what_arrived() {
    let url = raw_server(format!("{UNFINISHED_HEAD}{}", sse(&[&chunk("kept")])), After::Hang).await;
    let timeouts = HttpTimeouts { connect: Duration::from_secs(2), read: Duration::from_millis(300) };

    let result =
        stream_chat_with(&provider("openai", &url, Some("k"), "m"), req(), timeouts, flag(), &|_| {}, RetryPolicy::fast())
            .await;

    assert_eq!(result.unwrap(), "kept");
}

#[tokio::test]
async fn unsupported_max_tokens_retries_with_max_completion_tokens() {
    let server = MockServer::start().await;
    let complaint = r#"{"error":{"message":"Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead."}}"#;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(400).set_body_string(complaint))
        .up_to_n_times(1)
        .mount(&server)
        .await;
    Mock::given(method("POST")).respond_with(ok_stream(&["ok"])).mount(&server).await;

    let (result, _) = call(&provider("openai", &server.uri(), Some("k"), "o-test"), req()).await;

    assert_eq!(result.unwrap(), "ok");
    let sent = bodies(&server).await;
    assert_eq!(sent.len(), 2);
    assert_eq!(sent[0]["max_tokens"], 64);
    assert!(sent[0].get("temperature").is_some());
    assert_eq!(sent[1]["max_completion_tokens"], 64);
    assert!(sent[1].get("max_tokens").is_none());
    assert!(sent[1].get("temperature").is_none());
    assert_eq!(sent[1]["model"], "o-test", "the model is never swapped");
}

#[tokio::test]
async fn a_second_parameter_complaint_is_not_retried_again() {
    let complaint = r#"{"error":{"message":"Unsupported value: 'temperature' does not support 0.2 with this model."}}"#;
    let server = server_with(ResponseTemplate::new(400).set_body_string(complaint)).await;

    let err = call(&provider("openai", &server.uri(), Some("k"), "m"), req()).await.0.unwrap_err();

    assert_eq!(err.kind, LlmErrorKind::ProviderError);
    assert_eq!(server.received_requests().await.unwrap().len(), 2);
}

#[tokio::test]
async fn image_is_sent_as_image_url_part() {
    let server = server_with(ok_stream(&["ok"])).await;

    call(&provider("openai", &server.uri(), Some("k"), "m"), req_with_image()).await.0.unwrap();

    let body = &bodies(&server).await[0];
    let content = &body["messages"][1]["content"];
    assert_eq!(content[0], serde_json::json!({ "type": "text", "text": "hello" }));
    assert_eq!(content[1]["type"], "image_url");
    assert_eq!(content[1]["image_url"]["url"], "data:image/jpeg;base64,QUJD");
}

#[tokio::test]
async fn unreachable_port_is_unreachable() {
    let started = Instant::now();

    let err = call(&provider("custom", &dead_url(), None, "m"), req()).await.0.unwrap_err();

    assert_eq!(err.kind, LlmErrorKind::Unreachable);
    assert!(err.message.starts_with("Custom endpoint"), "{}", err.message);
    assert!(started.elapsed() < Duration::from_secs(4), "took {:?}", started.elapsed());
}

#[test]
fn retry_wait_honours_retry_after_within_bounds() {
    let policy = RetryPolicy::default();
    assert_eq!(policy.wait_ms(0, Some(0)), 800);
    assert_eq!(policy.wait_ms(0, Some(2)), 2000);
    assert_eq!(policy.wait_ms(0, Some(3600)), 6000);
    assert_eq!(policy.wait_ms(0, None), 1200);
    assert_eq!(policy.wait_ms(1, None), 2500);
    assert_eq!(policy.wait_ms(2, None), 4000);
    assert_eq!(policy.wait_ms(9, None), 4000);
    assert_eq!(policy.max_retries, 3);
}

#[tokio::test]
async fn key_with_unsendable_characters_is_bad_key_without_a_request() {
    let server = server_with(ok_stream(&["never"])).await;
    for key in ["sk-\u{952E}", "sk-a\nb", "sk a"] {
        let err = call(&provider("openai", &server.uri(), Some(key), "m"), req()).await.0.unwrap_err();
        assert_eq!(err.kind, LlmErrorKind::BadKey, "{key:?}");
        assert!(!err.message.contains(key));
    }
    assert!(server.received_requests().await.unwrap().is_empty());
}
