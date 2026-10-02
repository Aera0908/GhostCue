pub mod whisper;
pub mod deepgram;
pub mod engine;

use tauri::{AppHandle, State, Manager};
use crate::state::AppState;
use self::whisper::{download_whisper_model, WHISPER_MODELS};
use self::engine::TranscriptSegment;

#[tauri::command]
pub async fn get_transcript_history(state: State<'_, AppState>) -> Result<Vec<TranscriptSegment>, String> {
    Ok(state.inner().stt_engine.get_history())
}

#[tauri::command]
pub async fn clear_transcript_history(state: State<'_, AppState>) -> Result<(), String> {
    state.inner().stt_engine.clear_history();
    Ok(())
}

#[tauri::command]
pub async fn get_available_whisper_models(app_handle: AppHandle) -> Result<serde_json::Value, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let models_dir = app_dir.join("models");

    let models: Vec<serde_json::Value> = WHISPER_MODELS
        .iter()
        .map(|m| {
            let model_file = models_dir.join(format!("ggml-{}.bin", m.name));
            let is_downloaded = model_file.exists() && model_file.metadata().map(|meta| meta.len()).unwrap_or(0) >= m.min_bytes;
            serde_json::json!({
                "name": m.name,
                "url": m.url,
                "size": m.display_size,
                "downloaded": is_downloaded,
                "path": if is_downloaded { model_file.to_string_lossy().to_string() } else { "".to_string() },
            })
        })
        .collect();
    Ok(serde_json::json!(models))
}

#[tauri::command]
pub async fn download_model(
    app_handle: AppHandle,
    model_name: String,
) -> Result<String, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    let models_dir = app_dir.join("models");
    let downloaded_path = download_whisper_model(app_handle, models_dir, model_name).await?;
    Ok(downloaded_path.to_string_lossy().to_string())
}
