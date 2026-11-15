pub mod prompt;
pub mod error;
pub mod http;
pub mod provider;
pub mod anthropic;
pub mod discovery;
#[cfg(test)]
mod testutil;
pub mod ollama;
pub mod openai;
pub mod gemini;
pub mod orchestrator;

use tauri::{AppHandle, State};
use crate::state::AppState;
pub use prompt::PastAnswerEntry;

#[tauri::command]
pub async fn generate_ai_suggestion(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    action: String,
    custom_query: Option<String>,
    past_answers: Option<Vec<PastAnswerEntry>>,
    image_data: Option<String>,
) -> Result<String, String> {
    let config = state.inner().config_manager.get_config();
    let history = state.inner().stt_engine.get_history();
    let secrets = state.inner().secrets.clone();
    let sink = orchestrator::TauriSink(app_handle);
    state
        .inner()
        .llm_orchestrator
        .generate_suggestion(&sink, config, secrets.as_ref(), history, action, custom_query, past_answers, image_data)
        .await
}

#[tauri::command]
pub async fn cancel_ai_suggestion(state: State<'_, AppState>) -> Result<(), String> {
    state.inner().llm_orchestrator.cancel_generation();
    Ok(())
}
