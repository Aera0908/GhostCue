use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use log::info;
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter};

use crate::config::AppConfig;
use crate::stt::engine::TranscriptSegment;
use super::gemini::GeminiClient;
use super::ollama::OllamaClient;
use super::openai::OpenAiClient;
use super::prompt::{ActionType, PastAnswerEntry, PromptBuilder};

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
        past_answers: Option<Vec<PastAnswerEntry>>,
        image_data: Option<String>,
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
            "ask" | "generic" | "question" => ActionType::GenericQuestion,
            "clarify" => ActionType::Clarification,
            "elaborate" | "deepdive" => ActionType::Elaborate,
            "summary" | "bullets" => ActionType::Summary,
            "vision" | "screen" => ActionType::VisionScreen,
            _ => ActionType::InterviewAnswer,
        };

        let system_prompt = PromptBuilder::build_system_prompt(&config, action);
        let user_prompt = PromptBuilder::build_user_prompt(
            &history,
            action,
            custom_query.as_deref(),
            config.max_context_turns,
            past_answers.as_deref(),
        );

        let has_image = image_data.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false);
        let effective_model = config.get_effective_model(&action_name);

        info!("Routing action '{}' to provider: '{}', model: '{}' (smart routing: {})",
            action_name, config.llm_provider, effective_model, config.smart_model_routing);

        let payload_start = serde_json::json!({
            "action": action_name,
            "query": custom_query,
            "has_image": has_image,
            "provider": config.llm_provider,
            "model": effective_model.clone(),
            "smart_routed": config.smart_model_routing,
        });

        let _ = app_handle.emit_to("main", "llm-start", payload_start.clone());
        let _ = app_handle.emit("llm-start", payload_start);

        let result = match config.llm_provider.as_str() {
            "gemini" => {
                let client = GeminiClient::new(config.gemini_api_key, effective_model.clone());
                client.stream_chat(app_handle.clone(), system_prompt, user_prompt, image_data, abort_flag).await
            }
            "ollama" => {
                let client = OllamaClient::new(config.ollama_endpoint, effective_model.clone());
                client.stream_generate(app_handle.clone(), system_prompt, user_prompt, image_data, abort_flag).await
            }
            "openai" => {
                let client = OpenAiClient::new(config.openai_base_url, config.openai_api_key, effective_model.clone());
                client.stream_chat(app_handle.clone(), system_prompt, user_prompt, image_data, abort_flag).await
            }
            "anthropic" => {
                let client = OpenAiClient::new(
                    if config.custom_endpoint.is_empty() { "https://api.anthropic.com/v1".to_string() } else { config.custom_endpoint },
                    config.anthropic_api_key,
                    effective_model.clone(),
                );
                client.stream_chat(app_handle.clone(), system_prompt, user_prompt, image_data, abort_flag).await
            }
            "groq" => {
                let client = OpenAiClient::new(
                    "https://api.groq.com/openai/v1".to_string(),
                    config.openai_api_key,
                    effective_model.clone(),
                );
                client.stream_chat(app_handle.clone(), system_prompt, user_prompt, image_data, abort_flag).await
            }
            _ => {
                let client = OpenAiClient::new(config.custom_endpoint, config.custom_api_key, effective_model.clone());
                client.stream_chat(app_handle.clone(), system_prompt, user_prompt, image_data, abort_flag).await
            }
        };

        match result {
            Ok(full_text) => {
                let payload_complete = serde_json::json!({
                    "text": full_text.clone(),
                    "action": action_name,
                    "query": custom_query,
                    "model": effective_model,
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
