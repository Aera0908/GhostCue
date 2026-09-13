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
    content: serde_json::Value,
}

#[derive(Serialize)]
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
                .timeout(std::time::Duration::from_secs(60))
                .build()
                .unwrap_or_default(),
        }
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

        let body = ChatCompletionRequest {
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
            log::warn!("OpenAI API error status {}: {}", status, err_text);
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

                if trimmed.is_empty() {
                    continue;
                }

                if let Some(json_payload) = trimmed.strip_prefix("data:").map(|s| s.trim()) {
                    if json_payload == "[DONE]" {
                        continue;
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

        Ok(full_text)
    }
}
