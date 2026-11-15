use super::*;
use crate::llm::error::LlmErrorKind;
use crate::llm::testutil::*;
use serde_json::Value;
use std::time::{Duration, Instant};
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn msg(text: &str) -> String {
    serde_json::json!({ "message": { "role": "assistant", "content": text }, "done": false }).to_string()
}

const DONE: &str = r#"{"message":{"role":"assistant","content":""},"done":true}"#;

async fn chat_server(status: u16, body: String) -> MockServer {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/api/chat"))
        .respond_with(ResponseTemplate::new(status).set_body_raw(body, "application/x-ndjson"))
        .mount(&server)
        .await;
    server
}

async fn call(uri: &str, request: ChatRequest<'_>, vision: bool) -> (Result<String, LlmFailure>, Vec<String>) {
    let tokens = Tokens::default();
    let p = provider("ollama", uri, None, "llava-test");
    let result = stream_chat(&p, request, vision, quick(), flag(), &|t| tokens.push(t)).await;
    (result, tokens.all())
}

async fn first_body(server: &MockServer) -> Value {
    serde_json::from_slice(&server.received_requests().await.unwrap()[0].body).unwrap()
}

#[tokio::test]
async fn streams_tokens() {
    let server = chat_server(200, ndjson(&[&msg("Hel"), &msg("lo"), DONE])).await;

    let (result, tokens) = call(&server.uri(), req(), false).await;

    assert_eq!(result.unwrap(), "Hello");
    assert_eq!(tokens, ["Hel", "lo"]);
    let body = first_body(&server).await;
    assert_eq!(body["model"], "llava-test");
    assert_eq!(body["stream"], true);
    assert_eq!(body["messages"][0], serde_json::json!({ "role": "system", "content": "sys" }));
    assert_eq!(body["messages"][1], serde_json::json!({ "role": "user", "content": "hello" }));
}

#[tokio::test]
async fn error_line_is_surfaced() {
    let server = chat_server(200, ndjson(&[r#"{"error":"llama runner process has terminated"}"#])).await;

    let err = call(&server.uri(), req(), false).await.0.unwrap_err();

    assert_eq!(err.kind, LlmErrorKind::ProviderError);
    assert!(err.message.starts_with("Ollama"), "{}", err.message);
    assert!(err.message.contains("runner process has terminated"), "{}", err.message);
}

#[tokio::test]
async fn model_not_installed_message_has_pull_command() {
    let not_found = r#"{"error":"model 'llava-test' not found"}"#;
    for server in [chat_server(404, not_found.to_string()).await, chat_server(200, ndjson(&[not_found])).await] {
        let err = call(&server.uri(), req(), false).await.0.unwrap_err();
        assert_eq!(err.kind, LlmErrorKind::ModelNotFound);
        assert_eq!(err.message, "Ollama does not have \"llava-test\" installed. Run: ollama pull llava-test");
    }
}

#[tokio::test]
async fn empty_reply_is_error() {
    for body in [ndjson(&[DONE]), String::new(), ndjson(&[&msg("  "), DONE])] {
        let server = chat_server(200, body).await;
        assert_eq!(call(&server.uri(), req(), false).await.0.unwrap_err().kind, LlmErrorKind::EmptyResponse);
    }
}

#[tokio::test]
async fn server_down_is_unreachable_within_connect_timeout() {
    let started = Instant::now();

    let err = call(&dead_url(), req(), false).await.0.unwrap_err();

    assert_eq!(err.kind, LlmErrorKind::Unreachable);
    assert!(err.message.starts_with("Ollama"), "{}", err.message);
    assert!(started.elapsed() < Duration::from_secs(4), "took {:?}", started.elapsed());
}

#[tokio::test]
async fn image_omitted_when_not_vision() {
    let server = chat_server(200, ndjson(&[&msg("text only"), DONE])).await;

    let (result, _) = call(&server.uri(), req_with_image(), false).await;

    assert_eq!(result.unwrap(), "text only");
    assert!(first_body(&server).await["messages"][1].get("images").is_none());
}

#[tokio::test]
async fn image_sent_when_vision() {
    let server = chat_server(200, ndjson(&[&msg("seen"), DONE])).await;

    call(&server.uri(), req_with_image(), true).await.0.unwrap();

    assert_eq!(first_body(&server).await["messages"][1]["images"], serde_json::json!(["QUJD"]));
}

#[tokio::test]
async fn cancel_mid_stream() {
    let head = "HTTP/1.1 200 OK\r\ncontent-type: application/x-ndjson\r\ncontent-length: 99999\r\n\r\n";
    let url = raw_server(format!("{head}{}", ndjson(&[&msg("first")])), After::Hang).await;
    let abort = flag();
    cancel_after(&abort, 150);
    let started = Instant::now();

    let result = stream_chat(&provider("ollama", &url, None, "m"), req(), false, quick(), abort, &|_| {}).await;

    assert_eq!(result.unwrap_err().kind, LlmErrorKind::Cancelled);
    assert!(started.elapsed() < Duration::from_millis(600), "took {:?}", started.elapsed());
}

async fn tags_server(status: u16, body: &str) -> MockServer {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/api/tags"))
        .respond_with(ResponseTemplate::new(status).set_body_string(body))
        .mount(&server)
        .await;
    server
}

#[tokio::test]
async fn installed_models_parses_names() {
    let server = tags_server(200, r#"{"models":[{"name":"qwen2.5-coder:7b","size":1},{"name":"llava:latest"},{"size":2}]}"#).await;

    assert_eq!(installed_models(&server.uri(), quick()).await.unwrap(), ["qwen2.5-coder:7b", "llava:latest"]);
}

#[tokio::test]
async fn installed_models_empty_list_is_ok_empty() {
    for body in [r#"{"models":[]}"#, "{}", r#"{"models":null}"#] {
        let server = tags_server(200, body).await;
        assert_eq!(installed_models(&server.uri(), quick()).await.unwrap(), Vec::<String>::new(), "{body}");
    }
}

#[tokio::test]
async fn installed_models_failures_are_not_an_empty_list() {
    assert_eq!(installed_models(&dead_url(), quick()).await.unwrap_err().kind, LlmErrorKind::Unreachable);
    let server = tags_server(200, "<html>not ollama</html>").await;
    assert_eq!(installed_models(&server.uri(), quick()).await.unwrap_err().kind, LlmErrorKind::ProviderError);
    let server = tags_server(500, "").await;
    assert_eq!(installed_models(&server.uri(), quick()).await.unwrap_err().kind, LlmErrorKind::ProviderError);
}

async fn show_server(status: u16, body: &str) -> MockServer {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/api/show"))
        .respond_with(ResponseTemplate::new(status).set_body_string(body))
        .mount(&server)
        .await;
    server
}

#[tokio::test]
async fn model_supports_vision_true_and_false() {
    let server = show_server(200, r#"{"capabilities":["completion","vision"]}"#).await;
    assert!(model_supports_vision(&server.uri(), "llava", quick()).await.unwrap());
    let sent: Value = serde_json::from_slice(&server.received_requests().await.unwrap()[0].body).unwrap();
    assert_eq!(sent["model"], "llava");

    let server = show_server(200, r#"{"capabilities":["completion","tools"]}"#).await;
    assert!(!model_supports_vision(&server.uri(), "qwen", quick()).await.unwrap());
}

#[tokio::test]
async fn show_on_older_server_without_capabilities_is_false() {
    let server = show_server(200, r#"{"modelfile":"FROM llava","details":{"family":"llava"}}"#).await;
    assert!(!model_supports_vision(&server.uri(), "llava", quick()).await.unwrap());
}

#[tokio::test]
async fn a_model_named_like_a_vision_model_is_not_assumed_to_see() {
    let server = show_server(200, r#"{"capabilities":["completion"]}"#).await;
    assert!(!model_supports_vision(&server.uri(), "my-llava-vision-finetune", quick()).await.unwrap());
}
