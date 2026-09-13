use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use futures_util::StreamExt;
use log::info;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Serialize)]
struct OllamaGenerateRequest {
    model: String,
    prompt: String,
    system: String,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    images: Option<Vec<String>>,
}

#[derive(Deserialize)]
struct OllamaStreamResponse {
    response: Option<String>,
    done: Option<bool>,
}

pub struct OllamaClient {
    endpoint: String,
    model: String,
    client: Client,
}

impl OllamaClient {
    pub fn new(endpoint: String, model: String) -> Self {
        let clean_endpoint = endpoint.trim_end_matches('/').to_string();
        Self {
            endpoint: clean_endpoint,
            model,
            client: Client::new(),
        }
    }

    pub async fn stream_generate(
        &self,
        app_handle: AppHandle,
        system_prompt: String,
        user_prompt: String,
        image_data: Option<String>,
        abort_flag: Arc<AtomicBool>,
    ) -> Result<String, String> {
        let url = format!("{}/api/generate", self.endpoint);

        info!("Connecting to Ollama at {} with model {}", url, self.model);

        let is_vision_model = self.model.contains("vision")
            || self.model.contains("llava")
            || self.model.contains("minicpm")
            || self.model.contains("moondream");

        let images = if is_vision_model {
            image_data.and_then(|img| {
                if img.trim().is_empty() {
                    None
                } else {
                    Some(vec![img.trim().to_string()])
                }
            })
        } else {
            None
        };

        let req_body = OllamaGenerateRequest {
            model: self.model.clone(),
            prompt: user_prompt,
            system: system_prompt,
            stream: true,
            images,
        };

        let response = self
            .client
            .post(&url)
            .json(&req_body)
            .send()
            .await
            .map_err(|e| format!("Failed to connect to Ollama ({}): {}", url, e))?;

        if !response.status().is_success() {
            let status = response.status();
            let err_text = response.text().await.unwrap_or_default();
            return Err(format!("Ollama returned error status {}: {}", status, err_text));
        }

        let mut stream = response.bytes_stream();
        let mut full_response = String::new();
        let mut buffer = String::new();

        while let Some(chunk_res) = stream.next().await {
            if abort_flag.load(Ordering::SeqCst) {
                info!("Ollama streaming aborted by user.");
                break;
            }

            let chunk = chunk_res.map_err(|e| format!("Error reading stream chunk: {}", e))?;
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            while let Some(newline_pos) = buffer.find('\n') {
                let line: String = buffer.drain(..=newline_pos).collect();
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }

                if let Ok(parsed) = serde_json::from_str::<OllamaStreamResponse>(trimmed) {
                    if let Some(token) = parsed.response {
                        full_response.push_str(&token);
                        let payload = serde_json::json!({ "token": token });
                        let _ = app_handle.emit_to("main", "llm-token", payload.clone());
                        let _ = app_handle.emit("llm-token", payload);
                    }
                    if parsed.done.unwrap_or(false) {
                        break;
                    }
                }
            }
        }

        Ok(full_response)
    }
}
