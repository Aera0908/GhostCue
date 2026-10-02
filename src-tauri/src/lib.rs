pub mod audio;
pub mod config;
pub mod llm;
pub mod project_scanner;
pub mod state;
pub mod stt;
pub mod window;
pub mod screen;
pub mod stealth;

use log::info;
use state::AppState;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
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

            // Apply initial Anti-Capture Protection and ensure skip_taskbar is active
            if let Some(main_window) = app.get_webview_window("main") {
                let _ = main_window.set_skip_taskbar(true);
                let initial_config = app_state.config_manager.get_config();
                if initial_config.anti_capture_enabled {
                    let _ = apply_anti_capture_protection(&main_window, true);
                }
                if initial_config.focus_shield_enabled {
                    let _ = stealth::apply_focus_shield(&main_window, true);
                }
            }

            // Create System Tray Menu (shown in Windows Notification / Tray overflow)
            let show_item = MenuItem::with_id(app, "toggle_show", "Show / Hide GhostCue", true, None::<&str>)?;
            let mic_item = MenuItem::with_id(app, "toggle_capture", "Start / Pause Audio Capture", true, None::<&str>)?;
            let panic_item = MenuItem::with_id(app, "panic_hide", "Panic Hide (Ctrl+Shift+H)", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit GhostCue", true, None::<&str>)?;

            let tray_menu = Menu::with_items(app, &[&show_item, &mic_item, &panic_item, &quit_item])?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&tray_menu)
                .tooltip("GhostCue Stealth Interview Assistant")
                .show_menu_on_left_click(false);

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            let _tray = tray_builder
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "toggle_show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let is_minimized = window.is_minimized().unwrap_or(false);
                                let is_visible = window.is_visible().unwrap_or(false);
                                if is_minimized {
                                    let _ = window.unminimize();
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                } else if is_visible {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                        "toggle_capture" => {
                            let state = app.state::<AppState>();
                            let is_running = {
                                let cap = state.audio_capture.lock();
                                cap.is_running()
                            };
                            if is_running {
                                let mut cap = state.audio_capture.lock();
                                cap.stop();
                            } else {
                                let config = state.config_manager.get_config();
                                let mut cap = state.audio_capture.lock();
                                let sender = state.vad_segment_sender.clone();
                                let _ = cap.start(app.clone(), &config, sender);
                            }
                        }
                        "panic_hide" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.hide();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let is_minimized = window.is_minimized().unwrap_or(false);
                            let is_visible = window.is_visible().unwrap_or(false);
                            if is_minimized {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            } else if is_visible {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // Spawn background STT worker
            let stt_receiver = app_state.vad_segment_receiver.clone();
            let config_mgr_clone = app_state.config_manager.clone();
            let worker_handle = app_handle.clone();
            let history_state_clone = app_state.stt_engine.clone();

            tauri::async_runtime::spawn(async move {
                stt::engine::SttEngineManager::run_worker(
                    worker_handle.clone(),
                    stt_receiver,
                    history_state_clone.conversation_history.clone(),
                    move || config_mgr_clone.get_config(),
                    |_query| {
                        // Auto-triggering is centrally coordinated by the frontend
                        // which has real-time session, HUD state, and pause awareness.
                    },
                )
                .await;
            });

            app.manage(app_state);

            info!("GhostCue setup completed successfully with System Tray integration and Taskbar hidden.");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Window & Anti-Capture
            window::set_anti_capture,
            window::set_click_through,
            window::toggle_hud_visibility,
            window::set_hud_opacity,
            window::start_dragging,
            window::minimize_window,
            window::unminimize_window,
            window::exit_app,
            // Config
            config::get_app_config,
            config::save_app_config,
            // Audio
            audio::get_audio_devices,
            audio::start_audio_capture,
            audio::stop_audio_capture,
            audio::get_audio_capture_status,
            audio::get_audio_levels,
            audio::update_audio_vad_params,
            // STT
            stt::get_transcript_history,
            stt::clear_transcript_history,
            stt::get_available_whisper_models,
            stt::download_model,
            // LLM
            llm::generate_ai_suggestion,
            llm::cancel_ai_suggestion,
            // Project Scanner & File Export
            project_scanner::scan_project_directory,
            project_scanner::scan_multiple_project_directories,
            project_scanner::select_directory_dialog,
            project_scanner::save_text_file,
            // Screen Capture & OCR
            screen::capture_screen_for_ocr,
            // Stealth & Assessment Protection
            stealth::set_focus_shield,
            stealth::type_text_stealth,
            stealth::cancel_stealth_typing,
        ])
        .run(tauri::generate_context!())
        .expect("error while running GhostCue application");
}
