pub mod audio;
pub mod config;
pub mod llm;
pub mod state;
pub mod stt;
pub mod window;

use log::info;
use state::AppState;
use std::sync::Arc;
use tauri::Manager;
use window::apply_anti_capture_protection;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();
    info!("Starting GhostCue Stealth Interview Assistant...");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));

            // Initialize app state
            let app_state = AppState::new(app_data_dir);

            // Apply initial Anti-Capture Protection to main window
            if let Some(main_window) = app.get_webview_window("main") {
                let initial_config = app_state.config_manager.get_config();
                if initial_config.anti_capture_enabled {
                    let _ = apply_anti_capture_protection(&main_window, true);
                }
            }

            // Spawn background STT worker
            let stt_receiver = app_state.vad_segment_receiver.clone();
            let config_mgr_clone = app_state.config_manager.clone();
            let config_mgr_clone2 = app_state.config_manager.clone();
            let llm_orch_clone = app_state.llm_orchestrator.clone();
            let worker_handle = app_handle.clone();
            let history_state_clone = app_state.stt_engine.clone();

            tauri::async_runtime::spawn(async move {
                stt::engine::SttEngineManager::run_worker(
                    worker_handle.clone(),
                    stt_receiver,
                    history_state_clone.conversation_history.clone(),
                    move || config_mgr_clone.get_config(),
                    move |query| {
                        let h = worker_handle.clone();
                        let cfg = config_mgr_clone2.get_config();
                        let orch = llm_orch_clone.clone();
                        let hist = history_state_clone.get_history();
                        tauri::async_runtime::spawn(async move {
                            let _ = orch
                                .generate_suggestion(h, cfg, hist, "hint".to_string(), Some(query))
                                .await;
                        });
                    },
                )
                .await;
            });

            app.manage(app_state);

            info!("GhostCue setup completed successfully.");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Window & Anti-Capture
            window::set_anti_capture,
            window::set_click_through,
            window::toggle_hud_visibility,
            window::set_hud_opacity,
            window::start_dragging,
            // Config
            config::get_app_config,
            config::save_app_config,
            // Audio
            audio::get_audio_devices,
            audio::start_audio_capture,
            audio::stop_audio_capture,
            audio::get_audio_capture_status,
            audio::get_audio_levels,
            // STT
            stt::get_transcript_history,
            stt::clear_transcript_history,
            stt::get_available_whisper_models,
            stt::download_model,
            // LLM
            llm::generate_ai_suggestion,
            llm::cancel_ai_suggestion,
        ])
        .run(tauri::generate_context!())
        .expect("error while running GhostCue application");
}
