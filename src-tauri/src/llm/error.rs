use serde::Serialize;

const MAX_MESSAGE_CHARS: usize = 300;

#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum LlmErrorKind {
    MissingKey,
    BadKey,
    NoCredit,
    ModelNotFound,
    ModelNotChosen,
    RateLimited,
    Unreachable,
    Timeout,
    EmptyResponse,
    InvalidEndpoint,
    UnknownProvider,
    ProviderError,
    Cancelled,
}

#[derive(Serialize, Clone, Debug)]
pub struct LlmFailure {
    pub provider: String,
    pub kind: LlmErrorKind,
    pub message: String,
    pub retriable: bool,
}

impl LlmFailure {
    pub fn new(provider: &str, kind: LlmErrorKind, message: impl Into<String>) -> Self {
        Self {
            provider: provider.to_string(),
            kind,
            message: clamp(message.into()),
            retriable: false,
        }
    }
}

impl std::fmt::Display for LlmFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

fn clamp(message: String) -> String {
    if message.chars().count() <= MAX_MESSAGE_CHARS {
        return message;
    }
    let mut out: String = message.chars().take(MAX_MESSAGE_CHARS - 3).collect();
    out.push_str("...");
    out
}

/// The provider's own explanation, only when the body is JSON in a known error shape.
fn json_detail(body: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(body).ok()?;
    let err = v.get("error");
    let text = err
        .and_then(|e| e.get("message"))
        .and_then(|m| m.as_str())
        .or_else(|| err.and_then(|e| e.as_str()))
        .or_else(|| v.get("message").and_then(|m| m.as_str()))?;
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

/// `status` 0 means the error arrived inside a stream that had started with HTTP 200.
pub fn classify_http(provider: &str, status: u16, body: &str) -> LlmFailure {
    let lower = body.to_lowercase();
    let detail = json_detail(body);
    let has = |needle: &str| lower.contains(needle);

    let (kind, retriable) = if status == 402
        || has("insufficient_quota")
        || has("insufficient credits")
        || has("exceeded your current quota")
        || has("credit balance is too low")
    {
        (LlmErrorKind::NoCredit, false)
    } else if status == 401
        || status == 403
        || (status == 400 && (has("api key not valid") || has("api_key_invalid")))
    {
        (LlmErrorKind::BadKey, false)
    } else if (status == 404 && has("model")) || (has("model '") && has("not found")) {
        (LlmErrorKind::ModelNotFound, false)
    } else if status == 429 {
        (LlmErrorKind::RateLimited, true)
    } else if status >= 500 {
        (LlmErrorKind::ProviderError, true)
    } else {
        (LlmErrorKind::ProviderError, false)
    };

    let with_detail = |head: String| match &detail {
        Some(d) => format!("{head} {d}"),
        None => head,
    };
    let message = match kind {
        LlmErrorKind::BadKey => format!("{provider} rejected the API key. Check the key and try again."),
        LlmErrorKind::NoCredit => format!("{provider} reports no remaining credit or quota on this account."),
        LlmErrorKind::ModelNotFound => with_detail(format!("{provider} could not find the selected model.")),
        LlmErrorKind::RateLimited => format!("{provider} is rate limiting requests. Wait a moment and try again."),
        _ if status == 0 => with_detail(format!("{provider} reported an error while answering.")),
        _ => with_detail(format!("{provider} returned an error (HTTP {status}).")),
    };

    LlmFailure { provider: provider.to_string(), kind, message: clamp(message), retriable }
}

/// The reqwest error text is never included: it can carry the request URL.
pub fn classify_transport(provider: &str, err: &reqwest::Error) -> LlmFailure {
    // A connection that could not be opened is "unreachable" even when it was the connect
    // timeout that gave up. "Timeout" is kept for a server that connected and then went quiet.
    if err.is_connect() {
        LlmFailure::new(
            provider,
            LlmErrorKind::Unreachable,
            format!("{provider} could not be reached. Check the address and your connection."),
        )
    } else if err.is_timeout() {
        LlmFailure::new(provider, LlmErrorKind::Timeout, format!("{provider} did not respond in time."))
    } else {
        LlmFailure::new(
            provider,
            LlmErrorKind::Unreachable,
            format!("{provider} closed the connection before finishing."),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_http_table() {
        use LlmErrorKind::*;
        let big = "x".repeat(50_000);
        let rows: Vec<(u16, &str, LlmErrorKind, bool)> = vec![
            (401, r#"{"error":{"message":"Incorrect API key provided"}}"#, BadKey, false),
            (403, r#"{"error":{"message":"Forbidden"}}"#, BadKey, false),
            (402, "", NoCredit, false),
            (429, r#"{"error":{"code":"insufficient_quota","message":"You exceeded your current quota"}}"#, NoCredit, false),
            (400, r#"{"error":{"message":"Insufficient credits"}}"#, NoCredit, false),
            (400, r#"{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}"#, NoCredit, false),
            (404, r#"{"type":"error","error":{"type":"not_found_error","message":"model: claude-nope"}}"#, ModelNotFound, false),
            (404, r#"{"error":{"message":"The model `gpt-9` does not exist"}}"#, ModelNotFound, false),
            (404, r#"{"error":"model 'llama9' not found"}"#, ModelNotFound, false),
            (404, "", ProviderError, false),
            (429, r#"{"error":{"message":"Rate limit reached"}}"#, RateLimited, true),
            (500, "", ProviderError, true),
            (503, "<html><body><h1>503 Service Unavailable</h1></body></html>", ProviderError, true),
            (529, r#"{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}"#, ProviderError, true),
            (502, big.as_str(), ProviderError, true),
            (400, r#"{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}"#, BadKey, false),
            (400, r#"{"error":{"message":"bad request"}}"#, ProviderError, false),
        ];
        for (status, body, kind, retriable) in rows {
            let f = classify_http("Groq", status, body);
            assert_eq!(f.kind, kind, "status {status} body {:.60}", body);
            assert_eq!(f.retriable, retriable, "status {status} body {:.60}", body);
            assert!(f.message.chars().count() <= 300, "message too long for status {status}");
            assert!(f.message.starts_with("Groq"), "message was {:?}", f.message);
            assert_eq!(f.provider, "Groq");
        }
    }

    #[test]
    fn html_body_is_summarised_not_dumped() {
        let f = classify_http("OpenRouter", 503, "<html><body><h1>503 Service Unavailable</h1></body></html>");
        assert!(!f.message.contains('<'), "message was {:?}", f.message);
        assert!(f.message.contains("503"));
    }

    #[test]
    fn nested_json_message_is_used() {
        let f = classify_http("DeepSeek", 400, r#"{"error":{"message":"context length exceeded"}}"#);
        assert!(f.message.contains("context length exceeded"), "message was {:?}", f.message);
    }

    #[test]
    fn gemini_status_shape_is_used() {
        let f = classify_http(
            "Google Gemini",
            404,
            r#"{"error":{"code":404,"message":"models/gemini-9 is not found for API version v1beta","status":"NOT_FOUND"}}"#,
        );
        assert_eq!(f.kind, LlmErrorKind::ModelNotFound);
        assert!(f.message.starts_with("Google Gemini"));
    }

    #[test]
    fn message_names_the_real_provider() {
        let f = classify_http("Groq", 401, r#"{"error":{"message":"Invalid API Key"}}"#);
        assert!(f.message.starts_with("Groq"));
        assert!(!f.message.contains("OpenAI"));
    }

    #[test]
    fn message_never_echoes_a_key_like_body() {
        let f = classify_http("OpenAI", 401, "sk-live-THIS-IS-NOT-JSON");
        assert!(!f.message.contains("sk-live"), "message was {:?}", f.message);
    }

    #[test]
    fn kind_serialises_snake_case() {
        assert_eq!(serde_json::to_string(&LlmErrorKind::ModelNotChosen).unwrap(), "\"model_not_chosen\"");
    }

    #[tokio::test]
    async fn refused_connection_is_unreachable() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let err = reqwest::Client::new()
            .get(format!("http://127.0.0.1:{port}/"))
            .send()
            .await
            .unwrap_err();
        let f = classify_transport("Ollama", &err);
        assert_eq!(f.kind, LlmErrorKind::Unreachable);
        assert!(f.message.starts_with("Ollama"));
    }
}
