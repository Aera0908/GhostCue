use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use futures_util::StreamExt;
use log::info;
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use reqwest::Client;
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};

#[derive(Serialize)]
struct InlineData {
    #[serde(rename = "mimeType")]
    mime_type: String,
    data: String,
}

#[derive(Serialize)]
#[serde(untagged)]
enum GeminiPart {
    Text { text: String },
    Image {
        #[serde(rename = "inlineData")]
        inline_data: InlineData,
    },
}

#[derive(Serialize)]
struct GeminiContent {
    role: String,
    parts: Vec<GeminiPart>,
}

#[derive(Serialize)]
struct GeminiSystemInstruction {
    parts: Vec<GeminiPart>,
}

#[derive(Serialize)]
struct GeminiGenerationConfig {
    temperature: f32,
    #[serde(rename = "maxOutputTokens")]
    max_output_tokens: u32,
}

#[derive(Serialize)]
struct GeminiRequest {
    #[serde(rename = "systemInstruction")]
    system_instruction: GeminiSystemInstruction,
    contents: Vec<GeminiContent>,
    #[serde(rename = "generationConfig")]
    generation_config: GeminiGenerationConfig,
}

pub struct GeminiClient {
    api_key: String,
    model: String,
    client: Client,
}

impl GeminiClient {
    pub fn new(api_key: String, model: String) -> Self {
        let clean_model = if model.trim().is_empty() {
            "gemini-2.5-flash".to_string()
        } else {
            model.trim().to_string()
        };
        Self {
            api_key: api_key.trim().to_string(),
            model: clean_model,
            client: Client::new(),
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
        if self.api_key.is_empty() {
            return Err("Google Gemini API key is missing. Please configure it in settings.".to_string());
        }

        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?alt=sse&key={}",
            self.model, self.api_key
        );

        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        let mut user_parts: Vec<GeminiPart> = Vec::new();
        if let Some(img_b64) = image_data {
            if !img_b64.trim().is_empty() {
                user_parts.push(GeminiPart::Image {
                    inline_data: InlineData {
                        mime_type: "image/jpeg".to_string(),
                        data: img_b64,
                    },
                });
            }
        }
        user_parts.push(GeminiPart::Text {
            text: user_prompt,
        });

        let body = GeminiRequest {
            system_instruction: GeminiSystemInstruction {
                parts: vec![GeminiPart::Text {
                    text: system_prompt,
                }],
            },
            contents: vec![GeminiContent {
                role: "user".to_string(),
                parts: user_parts,
            }],
            generation_config: GeminiGenerationConfig {
                temperature: 0.3,
                max_output_tokens: 2048,
            },
        };

        info!("Sending streaming request to Google Gemini (model: {})", self.model);

        let response = self
            .client
            .post(&url)
            .headers(headers)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Request to Gemini failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let err_text = response.text().await.unwrap_or_default();
            return Err(format!("Gemini API returned error status {}: {}", status, err_text));
        }

        let mut stream = response.bytes_stream();
        let mut full_text = String::new();
        let mut buffer = String::new();

        while let Some(chunk_res) = stream.next().await {
            if abort_flag.load(Ordering::SeqCst) {
                info!("Gemini generation aborted by user.");
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

                if let Some(json_payload) = trimmed.strip_prefix("data: ") {
                    if let Ok(parsed) = serde_json::from_str::<Value>(json_payload) {
                        if let Some(candidates) = parsed.get("candidates").and_then(|c| c.as_array()) {
                            for cand in candidates {
                                if let Some(parts) = cand
                                    .get("content")
                                    .and_then(|c| c.get("parts"))
                                    .and_then(|p| p.as_array())
                                {
                                    for part in parts {
                                        if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                                            full_text.push_str(text);
                                            let payload = serde_json::json!({ "token": text });
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
        }

        Ok(full_text)
    }
}
