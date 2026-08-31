pub mod device;
pub mod resample;
pub mod ring_buffer;
pub mod vad;
pub mod capture;

use tauri::State;
use crate::state::AppState;
use self::device::{list_input_devices, list_output_devices};

#[tauri::command]
pub async fn get_audio_devices() -> Result<serde_json::Value, String> {
    let inputs = list_input_devices();
    let outputs = list_output_devices();
    Ok(serde_json::json!({
        "inputs": inputs,
        "outputs": outputs,
    }))
}

#[tauri::command]
pub async fn start_audio_capture(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let config = state.inner().config_manager.get_config();
    let mut capture_mgr = state.inner().audio_capture.lock();
    let sender = state.inner().vad_segment_sender.clone();
    
    capture_mgr.start(app_handle, &config, sender)?;
    Ok(true)
}

#[tauri::command]
pub async fn stop_audio_capture(
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let mut capture_mgr = state.inner().audio_capture.lock();
    capture_mgr.stop();
    Ok(false)
}

#[tauri::command]
pub async fn get_audio_capture_status(
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let capture_mgr = state.inner().audio_capture.lock();
    Ok(capture_mgr.is_running())
}

#[tauri::command]
pub fn get_audio_levels() -> serde_json::Value {
    let mic_bits = capture::CURRENT_MIC_LEVEL.load(std::sync::atomic::Ordering::Relaxed);
    let mic_active = capture::CURRENT_MIC_ACTIVE.load(std::sync::atomic::Ordering::Relaxed);
    let loopback_bits = capture::CURRENT_LOOPBACK_LEVEL.load(std::sync::atomic::Ordering::Relaxed);
    let loopback_active = capture::CURRENT_LOOPBACK_ACTIVE.load(std::sync::atomic::Ordering::Relaxed);

    let mic_level = f32::from_bits(mic_bits);
    let loopback_level = f32::from_bits(loopback_bits);

    serde_json::json!({
        "mic_level": mic_level,
        "mic_active": mic_active,
        "loopback_level": loopback_level,
        "loopback_active": loopback_active,
    })
}

