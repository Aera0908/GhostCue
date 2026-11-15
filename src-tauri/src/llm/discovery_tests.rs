use super::*;
use crate::config::AppConfig;
use crate::llm::error::LlmErrorKind;
use crate::llm::testutil::*;
use crate::secrets::{KeyId, MemoryStore, SecretStore};
use std::time::{Duration, Instant};
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn openai_stream(text: &str) -> ResponseTemplate {
    let chunk = serde_json::json!({ "choices": [{ "delta": { "content": text } }] }).to_string();
    ResponseTemplate::new(200).set_body_raw(sse(&[&chunk, "[DONE]"]), "text/event-stream")
}

async fn mock(verb: &str, route: &str, template: ResponseTemplate) -> MockServer {
    let server = MockServer::start().await;
    Mock::given(method(verb)).and(path(route)).respond_with(template).mount(&server).await;
    server
}

fn custom_cfg(endpoint: &str) -> AppConfig {
    AppConfig { custom_endpoint: endpoint.to_string(), custom_model: "local-model".into(), ..AppConfig::default() }
}

fn ollama_cfg(endpoint: &str, model: &str) -> AppConfig {
    AppConfig { ollama_endpoint: endpoint.to_string(), ollama_model: model.to_string(), ..AppConfig::default() }
}

fn ids(models: &[ModelInfo]) -> Vec<&str> {
    models.iter().map(|m| m.id.as_str()).collect()
}

#[tokio::test]
async fn test_ok_when_token_arrives() {
    let server = mock("POST", "/chat/completions", openai_stream("OK")).await;

    // The selected provider is Gemini; the test must use the one that was named.
    let result = test_provider(&custom_cfg(&server.uri()), &MemoryStore::new(), "custom").await;

    assert!(result.ok, "{}", result.message);
    assert_eq!(result.kind, None);
    assert_eq!(result.model, "local-model");
    assert!(result.message.contains("Custom endpoint"), "{}", result.message);
    let sent: serde_json::Value = serde_json::from_slice(&server.received_requests().await.unwrap()[0].body).unwrap();
    assert_eq!(sent["stream"], true, "the test must exercise the same streaming path as a real answer");
}

#[tokio::test]
async fn test_reports_model_and_latency() {
    let server = mock("POST", "/chat/completions", openai_stream("OK").set_delay(Duration::from_millis(120))).await;

    let result = test_provider(&custom_cfg(&server.uri()), &MemoryStore::new(), "custom").await;

    assert!(result.ok);
    assert_eq!(result.model, "local-model");
    assert!((100..5000).contains(&result.latency_ms), "{}", result.latency_ms);
}

#[tokio::test]
async fn test_bad_key_reports_bad_key() {
    let server = mock("POST", "/chat/completions", ResponseTemplate::new(401).set_body_string("{}")).await;
    let secrets = MemoryStore::new();
    secrets.set(KeyId::Custom, "custom-TESTONLY").unwrap();

    let result = test_provider(&custom_cfg(&server.uri()), &secrets, "custom").await;

    assert!(!result.ok);
    assert_eq!(result.kind, Some(LlmErrorKind::BadKey));
    assert!(result.message.contains("key"), "{}", result.message);
    assert!(!result.message.contains("TESTONLY"));
}

#[tokio::test]
async fn test_empty_answer_is_not_ok() {
    let body = sse(&["[DONE]"]);
    let server = mock("POST", "/chat/completions", ResponseTemplate::new(200).set_body_raw(body, "text/event-stream")).await;

    let result = test_provider(&custom_cfg(&server.uri()), &MemoryStore::new(), "custom").await;

    assert!(!result.ok);
    assert_eq!(result.kind, Some(LlmErrorKind::EmptyResponse));
}

#[tokio::test]
async fn test_unknown_slug_is_unknown_provider() {
    for slug in ["nope", "", "Custom"] {
        let result = test_provider(&AppConfig::default(), &MemoryStore::new(), slug).await;
        assert!(!result.ok);
        assert_eq!(result.kind, Some(LlmErrorKind::UnknownProvider), "{slug:?}");
    }
}

#[tokio::test]
async fn test_missing_key_makes_no_request() {
    let server = mock("POST", "/chat/completions", openai_stream("never")).await;
    let cfg = AppConfig { openai_base_url: server.uri(), ..AppConfig::default() };
    let secrets = MemoryStore::new();
    secrets.set(KeyId::Custom, "someone-elses-key").unwrap();

    let result = test_provider(&cfg, &secrets, "openai").await;

    assert_eq!(result.kind, Some(LlmErrorKind::MissingKey));
    assert!(list_models(&cfg, &secrets, "openai").await.is_err());
    assert!(server.received_requests().await.unwrap().is_empty());
}

#[tokio::test]
async fn test_gives_up_at_the_deadline() {
    let url = raw_server(UNFINISHED_HEAD.to_string(), After::Hang).await;
    let started = Instant::now();

    let result = test_provider_within(&custom_cfg(&url), &MemoryStore::new(), "custom", Duration::from_millis(300)).await;

    assert!(!result.ok);
    assert_eq!(result.kind, Some(LlmErrorKind::Timeout));
    assert!(started.elapsed() < Duration::from_secs(2), "took {:?}", started.elapsed());
}

#[tokio::test]
async fn ollama_no_models_is_its_own_result() {
    let server = mock("GET", "/api/tags", ResponseTemplate::new(200).set_body_string(r#"{"models":[]}"#)).await;

    let result = test_provider(&ollama_cfg(&server.uri(), "llama-test"), &MemoryStore::new(), "ollama").await;

    assert!(!result.ok);
    assert_eq!(result.kind, Some(LlmErrorKind::ModelNotFound));
    assert!(result.message.starts_with("Ollama is running but has no models installed. Run: ollama pull"), "{}", result.message);
    assert_eq!(server.received_requests().await.unwrap().len(), 1, "no chat request without a model");
}

#[tokio::test]
async fn ollama_with_models_but_none_chosen_asks_for_a_choice() {
    let server = mock("GET", "/api/tags", ResponseTemplate::new(200).set_body_string(r#"{"models":[{"name":"qwen:7b"}]}"#)).await;

    let result = test_provider(&ollama_cfg(&server.uri(), ""), &MemoryStore::new(), "ollama").await;

    assert!(!result.ok);
    assert_eq!(result.kind, Some(LlmErrorKind::ModelNotChosen));
}

#[tokio::test]
async fn ollama_chosen_model_not_installed_names_the_pull_command() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/api/tags"))
        .respond_with(ResponseTemplate::new(200).set_body_string(r#"{"models":[{"name":"other:latest"}]}"#))
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/api/chat"))
        .respond_with(ResponseTemplate::new(404).set_body_string(r#"{"error":"model 'llama-test' not found"}"#))
        .mount(&server)
        .await;

    let result = test_provider(&ollama_cfg(&server.uri(), "llama-test"), &MemoryStore::new(), "ollama").await;

    assert_eq!(result.kind, Some(LlmErrorKind::ModelNotFound));
    assert!(result.message.contains("ollama pull llama-test"), "{}", result.message);
}

#[tokio::test]
async fn ollama_down_is_unreachable() {
    let cfg = ollama_cfg(&dead_url(), "llama-test");

    let result = test_provider(&cfg, &MemoryStore::new(), "ollama").await;

    assert!(!result.ok);
    assert_eq!(result.kind, Some(LlmErrorKind::Unreachable));
    assert_eq!(list_models(&cfg, &MemoryStore::new(), "ollama").await.unwrap_err().kind, LlmErrorKind::Unreachable);
}

#[tokio::test]
async fn list_openai_wire() {
    let body = r#"{"data":[{"id":"zeta"},{"id":"alpha","architecture":{"input_modalities":["text","image"]}},{"id":"alpha"},{"object":"model"},{"id":"mid","architecture":{"input_modalities":["text"]}}]}"#;
    let server = mock("GET", "/models", ResponseTemplate::new(200).set_body_string(body)).await;
    let secrets = MemoryStore::new();
    secrets.set(KeyId::Custom, "custom-key").unwrap();

    let models = list_models(&custom_cfg(&server.uri()), &secrets, "custom").await.unwrap();

    assert_eq!(ids(&models), ["alpha", "mid", "zeta"]);
    assert_eq!(models[0].vision, Some(true));
    assert_eq!(models[1].vision, Some(false));
    assert_eq!(models[2].vision, None);
    let requests = server.received_requests().await.unwrap();
    assert_eq!(requests[0].headers.get("authorization").unwrap(), "Bearer custom-key");
}

#[tokio::test]
async fn list_works_before_any_model_is_chosen() {
    let server = mock("GET", "/models", ResponseTemplate::new(200).set_body_string(r#"{"data":[{"id":"only"}]}"#)).await;
    let mut cfg = custom_cfg(&server.uri());
    cfg.custom_model.clear();

    assert_eq!(ids(&list_models(&cfg, &MemoryStore::new(), "custom").await.unwrap()), ["only"]);
    assert!(server.received_requests().await.unwrap()[0].headers.get("authorization").is_none());
}

#[tokio::test]
async fn list_gemini_filters_and_strips_prefix() {
    let body = r#"{"models":[
        {"name":"models/gemini-b","supportedGenerationMethods":["generateContent","countTokens"]},
        {"name":"models/embedding-1","supportedGenerationMethods":["embedContent"]},
        {"name":"models/gemini-a","supportedGenerationMethods":["generateContent"]},
        {"name":"models/no-methods"}]}"#;
    let server = mock("GET", "/models", ResponseTemplate::new(200).set_body_string(body)).await;

    let models = list_models_at(&provider("gemini", &server.uri(), Some("AIza-SECRET"), "")).await.unwrap();

    assert_eq!(ids(&models), ["gemini-a", "gemini-b"]);
    let requests = server.received_requests().await.unwrap();
    assert_eq!(requests[0].headers.get("x-goog-api-key").unwrap(), "AIza-SECRET");
    assert!(!requests[0].url.to_string().contains("AIza"));
}

#[tokio::test]
async fn list_anthropic_uses_the_messages_api_headers() {
    let body = r#"{"data":[{"id":"claude-b","type":"model"},{"id":"claude-a","type":"model"}],"has_more":false}"#;
    let server = mock("GET", "/models", ResponseTemplate::new(200).set_body_string(body)).await;

    let models = list_models_at(&provider("anthropic", &server.uri(), Some("sk-ant-x"), "")).await.unwrap();

    assert_eq!(ids(&models), ["claude-a", "claude-b"]);
    let requests = server.received_requests().await.unwrap();
    assert_eq!(requests[0].headers.get("x-api-key").unwrap(), "sk-ant-x");
    assert_eq!(requests[0].headers.get("anthropic-version").unwrap(), "2026-10-21");
    assert!(requests[0].headers.get("authorization").is_none());
}

#[tokio::test]
async fn list_ollama() {
    let server = mock("GET", "/api/tags", ResponseTemplate::new(200).set_body_string(r#"{"models":[{"name":"b:7b"},{"name":"a:latest"}]}"#)).await;

    let models = list_models(&ollama_cfg(&server.uri(), ""), &MemoryStore::new(), "ollama").await.unwrap();

    assert_eq!(ids(&models), ["a:latest", "b:7b"]);
}

#[tokio::test]
async fn list_with_bad_key_is_bad_key() {
    let server = mock("GET", "/models", ResponseTemplate::new(401).set_body_string(r#"{"error":{"message":"nope"}}"#)).await;

    let err = list_models(&custom_cfg(&server.uri()), &MemoryStore::new(), "custom").await.unwrap_err();

    assert_eq!(err.kind, LlmErrorKind::BadKey);
    assert!(err.message.starts_with("Custom endpoint"));
}

#[tokio::test]
async fn list_with_malformed_json_is_provider_error() {
    for body in ["<html>captive portal</html>", "", r#"{"unexpected":true}"#, "[]", r#"{"data":"nope"}"#] {
        let server = mock("GET", "/models", ResponseTemplate::new(200).set_body_string(body)).await;
        let err = list_models(&custom_cfg(&server.uri()), &MemoryStore::new(), "custom").await.unwrap_err();
        assert_eq!(err.kind, LlmErrorKind::ProviderError, "{body:?}");
        assert!(!err.message.contains('<'));
    }
}

#[tokio::test]
async fn list_unknown_slug_is_unknown_provider() {
    let err = list_models(&AppConfig::default(), &MemoryStore::new(), "nope").await.unwrap_err();
    assert_eq!(err.kind, LlmErrorKind::UnknownProvider);
}

#[tokio::test]
async fn two_concurrent_tests_do_not_interfere() {
    let good = mock("POST", "/chat/completions", openai_stream("OK").set_delay(Duration::from_millis(100))).await;
    let bad = mock("POST", "/chat/completions", ResponseTemplate::new(401).set_body_string("{}")).await;
    let secrets = MemoryStore::new();
    let (good_cfg, bad_cfg) = (custom_cfg(&good.uri()), custom_cfg(&bad.uri()));

    let (a, b) = tokio::join!(test_provider(&good_cfg, &secrets, "custom"), test_provider(&bad_cfg, &secrets, "custom"));

    assert!(a.ok);
    assert_eq!(b.kind, Some(LlmErrorKind::BadKey));
    assert_eq!(good.received_requests().await.unwrap().len(), 1);
    assert_eq!(bad.received_requests().await.unwrap().len(), 1);
}
