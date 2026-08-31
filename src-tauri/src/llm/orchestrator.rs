use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use log::info;
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter};

use crate::config::AppConfig;
use crate::stt::engine::TranscriptSegment;
use super::ollama::OllamaClient;
use super::openai::OpenAiClient;
use super::prompt::{ActionType, PromptBuilder};

pub struct LlmOrchestrator {
    active_abort_flag: Arc<Mutex<Option<Arc<AtomicBool>>>>,
}

impl LlmOrchestrator {
    pub fn new() -> Self {
        Self {
            active_abort_flag: Arc::new(Mutex::new(None)),
        }
    }

    pub fn cancel_generation(&self) {
        let mut flag_guard = self.active_abort_flag.lock();
        if let Some(flag) = flag_guard.take() {
            info!("Aborting active LLM generation stream...");
            flag.store(true, Ordering::SeqCst);
        }
    }

    pub async fn generate_suggestion(
        &self,
        app_handle: AppHandle,
        config: AppConfig,
        history: Vec<TranscriptSegment>,
        action_name: String,
        custom_query: Option<String>,
    ) -> Result<String, String> {
        // Cancel any existing generation in flight
        self.cancel_generation();

        let abort_flag = Arc::new(AtomicBool::new(false));
        {
            let mut flag_guard = self.active_abort_flag.lock();
            *flag_guard = Some(abort_flag.clone());
        }

        let action = match action_name.as_str() {
            "code" => ActionType::CodeSolution,
            "clarify" => ActionType::Clarification,
            "elaborate" => ActionType::Elaborate,
            _ => ActionType::GeneralHint,
        };

        let system_prompt = PromptBuilder::build_system_prompt(&config);
        let user_prompt = PromptBuilder::build_user_prompt(
            &history,
            action,
            custom_query.as_deref(),
            config.max_context_turns,
        );

        let payload_start = serde_json::json!({
            "action": action_name,
            "provider": config.llm_provider,
            "model": match config.llm_provider.as_str() {
                "ollama" => config.ollama_model.clone(),
                "openai" => config.openai_model.clone(),
                "anthropic" => config.anthropic_model.clone(),
                _ => config.custom_model.clone(),
            }
        });

        let _ = app_handle.emit_to("main", "llm-start", payload_start.clone());
        let _ = app_handle.emit("llm-start", payload_start);

        let result = match config.llm_provider.as_str() {
            "ollama" => {
                let client = OllamaClient::new(config.ollama_endpoint, config.ollama_model);
                client.stream_generate(app_handle.clone(), system_prompt, user_prompt, abort_flag).await
            }
            "openai" => {
                let client = OpenAiClient::new(config.openai_base_url, config.openai_api_key, config.openai_model);
                client.stream_chat(app_handle.clone(), system_prompt, user_prompt, abort_flag).await
            }
            "anthropic" => {
                let client = OpenAiClient::new(
                    if config.custom_endpoint.is_empty() { "https://api.anthropic.com/v1".to_string() } else { config.custom_endpoint },
                    config.anthropic_api_key,
                    config.anthropic_model,
                );
                client.stream_chat(app_handle.clone(), system_prompt, user_prompt, abort_flag).await
            }
            "groq" => {
                let client = OpenAiClient::new(
                    "https://api.groq.com/openai/v1".to_string(),
                    config.openai_api_key,
                    if config.openai_model.is_empty() { "llama-3.3-70b-versatile".to_string() } else { config.openai_model },
                );
                client.stream_chat(app_handle.clone(), system_prompt, user_prompt, abort_flag).await
            }
            _ => {
                let client = OpenAiClient::new(config.custom_endpoint, config.custom_api_key, config.custom_model);
                client.stream_chat(app_handle.clone(), system_prompt, user_prompt, abort_flag).await
            }
        };

        match result {
            Ok(full_text) => {
                let payload_complete = serde_json::json!({
                    "text": full_text.clone(),
                    "action": action_name,
                });
                let _ = app_handle.emit_to("main", "llm-complete", payload_complete.clone());
                let _ = app_handle.emit("llm-complete", payload_complete);
                Ok(full_text)
            }
            Err(err) => {
                let payload_err = serde_json::json!({
                    "error": err.clone(),
                    "action": action_name,
                });
                let _ = app_handle.emit_to("main", "llm-error", payload_err.clone());
                let _ = app_handle.emit("llm-error", payload_err);
                Err(err)
            }
        }
    }
}
