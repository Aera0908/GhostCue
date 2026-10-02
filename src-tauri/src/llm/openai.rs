use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use futures_util::StreamExt;
use log::{info, warn};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION, CONTENT_TYPE, RETRY_AFTER};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone)]
struct ChatMessage {
    role: String,
    content: serde_json::Value,
}

#[derive(Serialize, Clone)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<ChatMessage>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_completion_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
}

#[derive(Deserialize)]
struct StreamDelta {
    content: Option<String>,
}

#[derive(Deserialize)]
#[allow(dead_code)]
struct StreamChoice {
    delta: Option<StreamDelta>,
    finish_reason: Option<String>,
}

#[derive(Deserialize)]
struct StreamChunk {
    choices: Option<Vec<StreamChoice>>,
}

#[derive(Deserialize, Debug)]
struct OpenAiErrorResponse {
    error: Option<OpenAiErrorDetail>,
}

#[derive(Deserialize, Debug)]
struct OpenAiErrorDetail {
    message: Option<String>,
    #[serde(rename = "type")]
    error_type: Option<String>,
    code: Option<serde_json::Value>,
}

pub struct OpenAiClient {
    base_url: String,
    api_key: String,
    model: String,
    client: Client,
}

impl OpenAiClient {
    pub fn new(base_url: String, api_key: String, model: String) -> Self {
        let clean_base = base_url.trim_end_matches('/').to_string();
        Self {
            base_url: clean_base,
            api_key,
            model,
            client: Client::builder()
                .connect_timeout(std::time::Duration::from_secs(15))
                .read_timeout(std::time::Duration::from_secs(120))
                .tcp_keepalive(std::time::Duration::from_secs(30))
                .pool_idle_timeout(std::time::Duration::from_secs(60))
                .build()
                .unwrap_or_default(),
        }
    }

    /// Parses OpenAI error body into (is_retriable, is_quota_exceeded, clean_error_message)
    fn parse_api_error(status: reqwest::StatusCode, body: &str) -> (bool, bool, String) {
        let parsed: Option<OpenAiErrorResponse> = serde_json::from_str(body).ok();
        let detail = parsed.as_ref().and_then(|p| p.error.as_ref());

        let raw_msg = detail
            .and_then(|d| d.message.as_deref())
            .unwrap_or(body.trim());
        let err_type = detail.and_then(|d| d.error_type.as_deref()).unwrap_or("");
        let err_code = detail
            .and_then(|d| d.code.as_ref())
            .map(|c| c.to_string())
            .unwrap_or_default();

        // 1. Permanent Quota / Billing limit / Payment Required (OpenAI & OpenRouter)
        if status == reqwest::StatusCode::PAYMENT_REQUIRED
            || err_code.contains("insufficient_quota")
            || err_code.contains("402")
            || err_type.contains("insufficient_quota")
            || raw_msg.to_lowercase().contains("insufficient credits")
            || raw_msg.to_lowercase().contains("exceeded your current quota")
        {
            return (
                false,
                true,
                format!("LLM provider account has insufficient credits or quota. Please check your credit balance at openrouter.ai or platform.openai.com: {}", raw_msg),
            );
        }

        // 2. Auth error
        if status == reqwest::StatusCode::UNAUTHORIZED
            || status == reqwest::StatusCode::FORBIDDEN
            || err_code.contains("invalid_api_key")
        {
            return (
                false,
                false,
                format!("Invalid API key. Please check your API key in Settings: {}", raw_msg),
            );
        }

        // 3. Rate limits (429) - Retriable
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS
            || err_code.contains("rate_limit_exceeded")
            || err_type.contains("tokens")
            || err_type.contains("requests")
        {
            let clean_msg = if !raw_msg.is_empty() {
                format!("OpenAI Rate Limit: {}", raw_msg)
            } else {
                "OpenAI rate limit temporarily reached. Cooldown in progress...".to_string()
            };
            return (true, false, clean_msg);
        }

        // 4. Server errors (500, 502, 503, 504, 529) - Retriable
        if status.is_server_error() || status.as_u16() == 529 {
            let clean_msg = if !raw_msg.is_empty() && raw_msg.len() < 200 {
                format!("OpenAI Server Notice ({}): {}", status.as_u16(), raw_msg)
            } else {
                format!("OpenAI server temporarily overloaded (HTTP {}). Retrying...", status.as_u16())
            };
            return (true, false, clean_msg);
        }

        // 5. Other client error
        let clean_msg = if !raw_msg.is_empty() {
            format!("OpenAI error: {}", raw_msg)
        } else {
            format!("OpenAI returned HTTP status {}", status)
        };
        (false, false, clean_msg)
    }

    pub async fn stream_chat(
        &self,
        app_handle: AppHandle,
        system_prompt: String,
        user_prompt: String,
        image_data: Option<String>,
        abort_flag: Arc<AtomicBool>,
    ) -> Result<String, String> {
        let url = if self.base_url.ends_with("/chat/completions") {
            self.base_url.clone()
        } else {
            format!("{}/chat/completions", self.base_url)
        };

        if self.api_key.trim().is_empty() {
            return Err("OpenAI/Cloud API key is missing. Please configure it in settings.".to_string());
        }

        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", self.api_key.trim()))
                .map_err(|e| format!("Invalid API key header: {}", e))?,
        );
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        if self.base_url.contains("openrouter.ai") {
            if let Ok(ref_hdr) = HeaderValue::from_str("https://ghostcue.app") {
                headers.insert(HeaderName::from_static("http-referer"), ref_hdr);
            }
            if let Ok(title_hdr) = HeaderValue::from_str("GhostCue") {
                headers.insert(HeaderName::from_static("x-title"), title_hdr);
            }
        }

        let has_image = image_data.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false);

        // o1-mini and o3-mini are text-only; route vision requests to gpt-4o automatically so they never fail
        let effective_model = if (self.model.starts_with("o1-mini") || self.model.starts_with("o3-mini")) && has_image {
            info!("Model {} is text-only. Routing screen vision request to gpt-4o", self.model);
            "gpt-4o".to_string()
        } else {
            self.model.clone()
        };

        let is_reasoning = effective_model.starts_with("o1") || effective_model.starts_with("o3");
        let (max_tokens, max_completion_tokens, temperature) = if is_reasoning {
            (None, Some(4096), None) // Reasoning models reject temperature and require max_completion_tokens
        } else {
            (Some(4096), None, Some(0.2)) // Low temperature for high-precision, bug-free coding
        };

        let system_role = if is_reasoning { "developer" } else { "system" };

        let user_content = if let Some(img_b64) = image_data {
            if !img_b64.trim().is_empty() {
                serde_json::json!([
                    {
                        "type": "text",
                        "text": user_prompt
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": format!("data:image/jpeg;base64,{}", img_b64.trim())
                        }
                    }
                ])
            } else {
                serde_json::Value::String(user_prompt)
            }
        } else {
            serde_json::Value::String(user_prompt)
        };

        let mut body = ChatCompletionRequest {
            model: effective_model.clone(),
            messages: vec![
                ChatMessage {
                    role: system_role.to_string(),
                    content: serde_json::Value::String(system_prompt),
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: user_content,
                },
            ],
            stream: true,
            max_tokens,
            max_completion_tokens,
            temperature,
        };

        info!("Sending streaming chat completion to {} (model: {})", url, effective_model);

        // Automatic retry loop with exponential backoff and jitter for transient 429 / 5xx / network glitches
        let max_retries = 3;
        let mut response: Option<reqwest::Response> = None;
        let mut last_error_msg = String::new();

        for attempt in 0..=max_retries {
            if abort_flag.load(Ordering::SeqCst) {
                return Err("Generation cancelled".to_string());
            }

            let send_res = self
                .client
                .post(&url)
                .headers(headers.clone())
                .json(&body)
                .send()
                .await;

            match send_res {
                Ok(resp) => {
                    let status = resp.status();
                    if status.is_success() {
                        response = Some(resp);
                        break;
                    }

                    // Extract response error body
                    let headers_clone = resp.headers().clone();
                    let err_text = resp.text().await.unwrap_or_default();
                    let (is_retriable, is_quota_exceeded, clean_msg) = Self::parse_api_error(status, &err_text);
                    warn!("OpenAI API error status {} (attempt {}/{}): {}", status, attempt + 1, max_retries + 1, clean_msg);
                    last_error_msg = clean_msg;

                    if !is_retriable || is_quota_exceeded || attempt >= max_retries {
                        return Err(last_error_msg);
                    }

                    // If token rate limit, reduce max_tokens on retry to fit within TPM window
                    if (status == reqwest::StatusCode::TOO_MANY_REQUESTS || err_text.contains("tokens")) && body.max_tokens == Some(4096) {
                        body.max_tokens = Some(2048);
                    }

                    // Calculate backoff wait
                    let retry_after_secs = headers_clone
                        .get(RETRY_AFTER)
                        .and_then(|v| v.to_str().ok())
                        .and_then(|s| s.parse::<u64>().ok());

                    let wait_ms = if let Some(secs) = retry_after_secs {
                        (secs * 1000).clamp(800, 6000)
                    } else {
                        match attempt {
                            0 => 1200,
                            1 => 2500,
                            _ => 4000,
                        }
                    };

                    info!("Retrying OpenAI request in {}ms (attempt {}/{})...", wait_ms, attempt + 1, max_retries);

                    // Sleep in 100ms intervals to respond immediately to abort_flag
                    let intervals = wait_ms / 100;
                    for _ in 0..intervals {
                        if abort_flag.load(Ordering::SeqCst) {
                            return Err("Generation cancelled".to_string());
                        }
                        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                    }
                }
                Err(e) => {
                    warn!("Network request to {} failed (attempt {}/{}): {}", url, attempt + 1, max_retries + 1, e);
                    last_error_msg = format!("Network connection failed: {}", e);

                    if attempt >= max_retries {
                        return Err(last_error_msg);
                    }

                    let wait_ms = match attempt {
                        0 => 800,
                        1 => 1800,
                        _ => 3000,
                    };

                    let intervals = wait_ms / 100;
                    for _ in 0..intervals {
                        if abort_flag.load(Ordering::SeqCst) {
                            return Err("Generation cancelled".to_string());
                        }
                        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                    }
                }
            }
        }

        let resp = match response {
            Some(r) => r,
            None => {
                return Err(if !last_error_msg.is_empty() {
                    last_error_msg
                } else {
                    "Failed to communicate with OpenAI after multiple attempts. Please check network connection.".to_string()
                });
            }
        };

        let mut stream = resp.bytes_stream();
        let mut full_text = String::new();
        let mut buffer = String::new();

        while let Some(chunk_res) = stream.next().await {
            if abort_flag.load(Ordering::SeqCst) {
                info!("Cloud LLM streaming aborted by user.");
                return Err("Generation cancelled".to_string());
            }

            let chunk = match chunk_res {
                Ok(c) => c,
                Err(e) => {
                    warn!("OpenAI stream chunk error: {}", e);
                    if !full_text.is_empty() {
                        // Return already generated text if network drops mid-stream rather than failing completely
                        break;
                    }
                    return Err(format!("Stream error: {}", e));
                }
            };
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            while let Some(newline_pos) = buffer.find('\n') {
                let line: String = buffer.drain(..=newline_pos).collect();
                let trimmed = line.trim();

                if trimmed.is_empty() {
                    continue;
                }

                if let Some(json_payload) = trimmed.strip_prefix("data:").map(|s| s.trim()) {
                    if json_payload == "[DONE]" {
                        continue;
                    }

                    // Check for inline error payload in the SSE stream
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_payload) {
                        if let Some(err_obj) = val.get("error") {
                            let err_msg = err_obj
                                .get("message")
                                .and_then(|m| m.as_str())
                                .unwrap_or("Stream encountered an error");
                            warn!("OpenAI stream returned error: {}", err_msg);
                            if full_text.is_empty() {
                                return Err(format!("OpenAI error: {}", err_msg));
                            } else {
                                break;
                            }
                        }
                    }

                    if let Ok(parsed) = serde_json::from_str::<StreamChunk>(json_payload) {
                        if let Some(choices) = parsed.choices {
                            for choice in choices {
                                if let Some(delta) = choice.delta {
                                    if let Some(token) = delta.content {
                                        full_text.push_str(&token);
                                        let payload = serde_json::json!({ "token": token });
                                        let _ = app_handle.emit_to("main", "llm-token", payload.clone());
                                        let _ = app_handle.emit("llm-token", payload);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if abort_flag.load(Ordering::SeqCst) {
            return Err("Generation cancelled".to_string());
        }

        if full_text.trim().is_empty() {
            return Err("OpenAI returned an empty response. Please try again.".to_string());
        }

        Ok(full_text)
    }
}
