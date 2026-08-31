pub mod prompt;
pub mod ollama;
pub mod openai;
pub mod orchestrator;

use tauri::{AppHandle, Emitter, State};
use crate::state::AppState;
use crate::stt::engine::TranscriptSegment;

#[tauri::command]
pub async fn generate_ai_suggestion(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    action: String,
    custom_query: Option<String>,
) -> Result<String, String> {
    // If a custom query was submitted, register it into conversation history and broadcast
    if let Some(ref query) = custom_query {
        let trimmed = query.trim();
        if !trimmed.is_empty() {
            let segment = TranscriptSegment {
                id: uuid::Uuid::new_v4().to_string(),
                speaker: "Candidate Query".to_string(),
                text: trimmed.to_string(),
                timestamp: chrono::Utc::now().to_rfc3339(),
                is_final: true,
                confidence: 1.0,
                duration_secs: 0.5,
            };
            let _ = app_handle.emit("transcript-event", &segment);
            state.inner().stt_engine.add_segment(segment);
        }
    }

    let config = state.inner().config_manager.get_config();
    let history = state.inner().stt_engine.get_history();
    state
        .inner()
        .llm_orchestrator
        .generate_suggestion(app_handle, config, history, action, custom_query)
        .await
}

#[tauri::command]
pub async fn cancel_ai_suggestion(state: State<'_, AppState>) -> Result<(), String> {
    state.inner().llm_orchestrator.cancel_generation();
    Ok(())
}
