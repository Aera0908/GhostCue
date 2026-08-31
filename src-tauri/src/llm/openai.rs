use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use futures_util::StreamExt;
use log::info;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<ChatMessage>,
    stream: bool,
    max_tokens: Option<u32>,
    temperature: f32,
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
            client: Client::new(),
        }
    }

    pub async fn stream_chat(
        &self,
        app_handle: AppHandle,
        system_prompt: String,
        user_prompt: String,
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

        let body = ChatCompletionRequest {
            model: self.model.clone(),
            messages: vec![
                ChatMessage {
                    role: "system".to_string(),
                    content: system_prompt,
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: user_prompt,
                },
            ],
            stream: true,
            max_tokens: Some(600),
            temperature: 0.3,
        };

        info!("Sending streaming chat completion to {} (model: {})", url, self.model);

        let response = self
            .client
            .post(&url)
            .headers(headers)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Request to {} failed: {}", url, e))?;

        if !response.status().is_success() {
            let status = response.status();
            let err_text = response.text().await.unwrap_or_default();
            return Err(format!("API returned error status {}: {}", status, err_text));
        }

        let mut stream = response.bytes_stream();
        let mut full_text = String::new();
        let mut buffer = String::new();

        while let Some(chunk_res) = stream.next().await {
            if abort_flag.load(Ordering::SeqCst) {
                info!("Cloud LLM streaming aborted by user.");
                break;
            }

            let chunk = chunk_res.map_err(|e| format!("Stream error: {}", e))?;
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            while let Some(newline_pos) = buffer.find('\n') {
                let line: String = buffer.drain(..=newline_pos).collect();
                let trimmed = line.trim();

                if trimmed.is_empty() || trimmed == "data: [DONE]" {
                    continue;
                }

                if let Some(json_payload) = trimmed.strip_prefix("data: ") {
                    if let Ok(parsed) = serde_json::from_str::<StreamChunk>(json_payload) {
                        if let Some(choices) = parsed.choices {
                            for choice in choices {
                                if let Some(delta) = choice.delta {
                                    if let Some(token) = delta.content {
                                        full_text.push_str(&token);
                                        let _ = app_handle.emit("llm-token", serde_json::json!({ "token": token }));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(full_text)
    }
}
