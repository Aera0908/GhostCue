use super::*;
use crate::config::AppConfig;
use crate::llm::error::LlmErrorKind;
use crate::llm::testutil::*;
use crate::secrets::{KeyId, MemoryStore, SecretStore};
use serde_json::Value;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

#[derive(Default)]
struct Recorder(Mutex<Vec<(String, Value)>>);

impl EventSink for Recorder {
    fn emit(&self, event: &str, payload: Value) {
        self.0.lock().unwrap().push((event.to_string(), payload));
    }
}

impl Recorder {
    fn names(&self) -> Vec<String> {
        self.0.lock().unwrap().iter().map(|(n, _)| n.clone()).collect()
    }
    fn payload(&self, event: &str) -> Value {
        self.0.lock().unwrap().iter().find(|(n, _)| n == event).unwrap_or_else(|| panic!("no {event} event")).1.clone()
    }
}

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
    AppConfig {
        llm_provider: "custom".into(),
        custom_endpoint: endpoint.to_string(),
        custom_model: "local-model".into(),
        ..AppConfig::default()
    }
}

async fn generate(
    orchestrator: &LlmOrchestrator,
    sink: &Recorder,
    cfg: AppConfig,
    secrets: &dyn SecretStore,
    action: &str,
    image: Option<&str>,
) -> Result<String, String> {
    orchestrator
        .generate_suggestion(sink, cfg, secrets, Vec::new(), action.to_string(), Some("what is a mutex".into()), None, image.map(str::to_string))
        .await
}

#[tokio::test]
async fn dispatches_by_wire() {
    let openai = mock("POST", "/chat/completions", openai_stream("from openai wire")).await;
    let anthropic_event = r#"{"type":"content_block_delta","delta":{"type":"text_delta","text":"from anthropic wire"}}"#;
    let anthropic =
        mock("POST", "/messages", ResponseTemplate::new(200).set_body_raw(sse(&[anthropic_event]), "text/event-stream")).await;
    let gemini_event = r#"{"candidates":[{"content":{"parts":[{"text":"from gemini wire"}]}}]}"#;
    let gemini = mock(
        "POST",
        "/models/m:streamGenerateContent",
        ResponseTemplate::new(200).set_body_raw(sse(&[gemini_event]), "text/event-stream"),
    )
    .await;
    let ollama_line = r#"{"message":{"content":"from ollama wire"},"done":true}"#;
    let ollama = mock("POST", "/api/chat", ResponseTemplate::new(200).set_body_string(ndjson(&[ollama_line]))).await;

    for (slug, server, expected) in [
        ("groq", &openai, "from openai wire"),
        ("anthropic", &anthropic, "from anthropic wire"),
        ("gemini", &gemini, "from gemini wire"),
        ("ollama", &ollama, "from ollama wire"),
    ] {
        let out = run(&provider(slug, &server.uri(), Some("k"), "m"), req(), flag(), &|_| {}).await.unwrap();
        assert_eq!(out.text, expected, "{slug}");
        assert!(!out.image_dropped);
        assert_eq!(server.received_requests().await.unwrap().len(), 1, "{slug}");
    }
}

#[tokio::test]
async fn ollama_image_is_dropped_only_for_a_model_that_cannot_see() {
    let line = r#"{"message":{"content":"answer"},"done":true}"#;
    for (capabilities, dropped) in [(r#"["completion"]"#, true), (r#"["completion","vision"]"#, false)] {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/show"))
            .respond_with(ResponseTemplate::new(200).set_body_string(format!(r#"{{"capabilities":{capabilities}}}"#)))
            .mount(&server)
            .await;
        Mock::given(method("POST"))
            .and(path("/api/chat"))
            .respond_with(ResponseTemplate::new(200).set_body_string(ndjson(&[line])))
            .mount(&server)
            .await;

        let out = run(&provider("ollama", &server.uri(), None, "m"), req_with_image(), flag(), &|_| {}).await.unwrap();

        assert_eq!(out.text, "answer");
        assert_eq!(out.image_dropped, dropped);
    }
}

#[tokio::test]
async fn success_emits_start_tokens_then_complete() {
    let server = mock("POST", "/chat/completions", openai_stream("a mutex is a lock")).await;
    let sink = Recorder::default();

    let result = generate(&LlmOrchestrator::new(), &sink, custom_cfg(&server.uri()), &MemoryStore::new(), "ask", None).await;

    assert_eq!(result.unwrap(), "a mutex is a lock");
    assert_eq!(sink.names(), ["llm-start", "llm-token", "llm-complete"]);
    let start = sink.payload("llm-start");
    assert_eq!(start["provider"], "custom");
    assert_eq!(start["model"], "local-model");
    assert_eq!(start["smart_routed"], false);
    assert_eq!(start["has_image"], false);
    assert_eq!(start["action"], "ask");
    assert_eq!(sink.payload("llm-token")["token"], "a mutex is a lock");
    assert_eq!(sink.payload("llm-complete")["text"], "a mutex is a lock");
    assert_eq!(sink.payload("llm-complete")["model"], "local-model");
}

#[tokio::test]
async fn code_model_is_reported_as_smart_routed_only_when_used() {
    let server = mock("POST", "/chat/completions", openai_stream("ok")).await;
    let mut cfg = custom_cfg(&server.uri());
    cfg.smart_model_routing = true;
    cfg.code_models.insert("custom".into(), "code-model".into());

    for (action, model, routed) in [("code", "code-model", true), ("ask", "local-model", false)] {
        let sink = Recorder::default();
        generate(&LlmOrchestrator::new(), &sink, cfg.clone(), &MemoryStore::new(), action, None).await.unwrap();
        assert_eq!(sink.payload("llm-start")["model"], model, "{action}");
        assert_eq!(sink.payload("llm-start")["smart_routed"], routed, "{action}");
    }
}

#[tokio::test]
async fn failure_emits_llm_error_with_kind_and_provider() {
    let server = mock("POST", "/chat/completions", ResponseTemplate::new(401).set_body_string("{}")).await;
    let sink = Recorder::default();
    let secrets = MemoryStore::new();
    secrets.set(KeyId::Custom, "custom-TESTONLY").unwrap();

    let result = generate(&LlmOrchestrator::new(), &sink, custom_cfg(&server.uri()), &secrets, "ask", None).await;

    let message = result.unwrap_err();
    assert!(message.starts_with("Custom endpoint"), "{message}");
    assert_eq!(sink.names(), ["llm-start", "llm-error"]);
    let error = sink.payload("llm-error");
    assert_eq!(error["kind"], "bad_key");
    assert_eq!(error["provider"], "Custom endpoint");
    assert_eq!(error["action"], "ask");
    assert_eq!(error["error"], message);
    assert!(!sink.0.lock().unwrap().iter().any(|(_, p)| p.to_string().contains("TESTONLY")), "a key reached the frontend");
}

#[tokio::test]
async fn setup_problems_are_reported_without_any_request() {
    let server = mock("POST", "/chat/completions", openai_stream("never")).await;
    let mut unknown = custom_cfg(&server.uri());
    unknown.llm_provider = "nope".into();
    let mut no_key = custom_cfg(&server.uri());
    no_key.llm_provider = "openai".into();
    no_key.openai_base_url = server.uri();
    let mut no_model = custom_cfg(&server.uri());
    no_model.custom_model.clear();

    for (cfg, kind) in [
        (unknown, LlmErrorKind::UnknownProvider),
        (no_key, LlmErrorKind::MissingKey),
        (no_model, LlmErrorKind::ModelNotChosen),
    ] {
        let sink = Recorder::default();
        let result = generate(&LlmOrchestrator::new(), &sink, cfg, &MemoryStore::new(), "ask", None).await;
        assert!(result.is_err());
        assert_eq!(sink.names(), ["llm-error"], "{kind:?}");
        assert_eq!(sink.payload("llm-error")["kind"], serde_json::to_value(kind).unwrap());
    }
    assert!(server.received_requests().await.unwrap().is_empty());
}

#[tokio::test]
async fn cancelled_generation_emits_no_error() {
    let chunk = serde_json::json!({ "choices": [{ "delta": { "content": "partial" } }] }).to_string();
    let url = raw_server(format!("{UNFINISHED_HEAD}{}", sse(&[&chunk])), After::Hang).await;
    let orchestrator = Arc::new(LlmOrchestrator::new());
    let sink = Recorder::default();
    let canceller = orchestrator.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(150)).await;
        canceller.cancel_generation();
    });

    let result = generate(&orchestrator, &sink, custom_cfg(&url), &MemoryStore::new(), "ask", None).await;

    assert_eq!(result.unwrap(), "");
    assert_eq!(sink.names(), ["llm-start", "llm-token"]);
}

#[tokio::test]
async fn new_generation_cancels_previous() {
    let chunk = serde_json::json!({ "choices": [{ "delta": { "content": "old" } }] }).to_string();
    let stalled = raw_server(format!("{UNFINISHED_HEAD}{}", sse(&[&chunk])), After::Hang).await;
    let healthy = mock("POST", "/chat/completions", openai_stream("new answer")).await;
    let orchestrator = Arc::new(LlmOrchestrator::new());
    let first_sink = Arc::new(Recorder::default());

    let first = {
        let (orchestrator, sink, cfg) = (orchestrator.clone(), first_sink.clone(), custom_cfg(&stalled));
        tokio::spawn(async move { generate(&orchestrator, &sink, cfg, &MemoryStore::new(), "ask", None).await })
    };
    tokio::time::sleep(Duration::from_millis(150)).await;
    let second_sink = Recorder::default();
    let second = generate(&orchestrator, &second_sink, custom_cfg(&healthy.uri()), &MemoryStore::new(), "ask", None).await;

    assert_eq!(second.unwrap(), "new answer");
    assert_eq!(second_sink.names(), ["llm-start", "llm-token", "llm-complete"]);
    let first = tokio::time::timeout(Duration::from_secs(1), first).await.expect("the first generation must stop").unwrap();
    assert_eq!(first.unwrap(), "");
    assert!(!first_sink.names().iter().any(|n| n == "llm-error" || n == "llm-complete"));
}

#[tokio::test]
async fn dropped_image_is_announced() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/api/show"))
        .respond_with(ResponseTemplate::new(200).set_body_string(r#"{"capabilities":["completion"]}"#))
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/api/chat"))
        .respond_with(ResponseTemplate::new(200).set_body_string(ndjson(&[r#"{"message":{"content":"text answer"},"done":true}"#])))
        .mount(&server)
        .await;
    let cfg = AppConfig {
        llm_provider: "ollama".into(),
        ollama_endpoint: server.uri(),
        ollama_model: "text-only".into(),
        ..AppConfig::default()
    };
    let sink = Recorder::default();

    let result = generate(&LlmOrchestrator::new(), &sink, cfg, &MemoryStore::new(), "screen", Some("QUJD")).await;

    assert_eq!(result.unwrap(), "text answer");
    assert!(sink.names().contains(&"llm-notice".to_string()), "{:?}", sink.names());
    assert!(sink.payload("llm-notice")["message"].as_str().unwrap().contains("text-only"));
    assert_eq!(sink.payload("llm-start")["has_image"], true);
}
