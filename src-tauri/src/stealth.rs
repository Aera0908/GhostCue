use std::sync::atomic::{AtomicBool, Ordering};
use log::info;
use tauri::WebviewWindow;

#[cfg(windows)]
use windows::Win32::Foundation::HWND;
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongW, SetWindowLongW, SetWindowPos, GWL_EXSTYLE, WS_EX_NOACTIVATE,
    SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SWP_FRAMECHANGED,
};
#[cfg(windows)]
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT,
    KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, VIRTUAL_KEY, VK_RETURN,
    VK_SHIFT, VK_CONTROL, VK_MENU, VK_LWIN, VK_RWIN,
};

static IS_TYPING: AtomicBool = AtomicBool::new(false);

/// Release any modifier keys that might be in a held-down state
#[cfg(windows)]
pub fn release_all_modifiers() {
    unsafe {
        for vk in [VK_SHIFT, VK_CONTROL, VK_MENU, VK_LWIN, VK_RWIN] {
            let input_up = INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: vk,
                        wScan: 0,
                        dwFlags: KEYEVENTF_KEYUP,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            };
            SendInput(&[input_up], std::mem::size_of::<INPUT>() as i32);
        }
    }
}

#[cfg(not(windows))]
pub fn release_all_modifiers() {}

/// Toggles the WS_EX_NOACTIVATE extended window style.
/// When enabled, interaction with the window does not activate it or steal system focus.
pub fn apply_focus_shield(window: &WebviewWindow, enabled: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        let hwnd_raw = window.hwnd().map_err(|e| format!("Failed to get HWND: {}", e))?;
        let hwnd = HWND(hwnd_raw.0);

        unsafe {
            let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
            let no_activate_flag = WS_EX_NOACTIVATE.0 as i32;
            let new_style = if enabled {
                ex_style | no_activate_flag
            } else {
                ex_style & !no_activate_flag
            };
            SetWindowLongW(hwnd, GWL_EXSTYLE, new_style);
            let _ = SetWindowPos(
                hwnd,
                HWND::default(),
                0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED,
            );
        }
        release_all_modifiers();
        if !enabled {
            let _ = window.set_focus();
        }
        info!("Applied focus shield (WS_EX_NOACTIVATE = {}).", enabled);
        Ok(())
    }

    #[cfg(not(windows))]
    Ok(())
}

#[tauri::command]
pub async fn set_focus_shield(window: WebviewWindow, enabled: bool) -> Result<bool, String> {
    apply_focus_shield(&window, enabled)?;
    Ok(enabled)
}

#[tauri::command]
pub async fn cancel_stealth_typing() -> Result<(), String> {
    info!("Cancelling stealth typing in progress...");
    IS_TYPING.store(false, Ordering::SeqCst);
    release_all_modifiers();
    Ok(())
}

/// Simulates typing text character-by-character into the active window.
#[tauri::command]
pub async fn type_text_stealth(text: String, speed_ms: Option<u64>) -> Result<(), String> {
    if text.trim().is_empty() {
        return Ok(());
    }

    // Cancel any previous run
    IS_TYPING.store(false, Ordering::SeqCst);
    std::thread::sleep(std::time::Duration::from_millis(50));
    IS_TYPING.store(true, Ordering::SeqCst);

    let base_delay = speed_ms.unwrap_or(25);

    tokio::task::spawn_blocking(move || {
        info!("Starting Stealth Typer ({} chars)...", text.len());

        #[cfg(windows)]
        {
            // Release any modifier keys before typing
            release_all_modifiers();

            // Grace period before sending input
            std::thread::sleep(std::time::Duration::from_millis(200));

            for ch in text.chars() {
                if !IS_TYPING.load(Ordering::SeqCst) {
                    info!("Stealth typing cancelled.");
                    break;
                }

                if ch == '\r' {
                    continue;
                }

                if ch == '\n' {
                    unsafe {
                        let input_down = INPUT {
                            r#type: INPUT_KEYBOARD,
                            Anonymous: INPUT_0 {
                                ki: KEYBDINPUT {
                                    wVk: VK_RETURN,
                                    wScan: 0,
                                    dwFlags: Default::default(),
                                    time: 0,
                                    dwExtraInfo: 0,
                                },
                            },
                        };
                        let input_up = INPUT {
                            r#type: INPUT_KEYBOARD,
                            Anonymous: INPUT_0 {
                                ki: KEYBDINPUT {
                                    wVk: VK_RETURN,
                                    wScan: 0,
                                    dwFlags: KEYEVENTF_KEYUP,
                                    time: 0,
                                    dwExtraInfo: 0,
                                },
                            },
                        };
                        SendInput(&[input_down, input_up], std::mem::size_of::<INPUT>() as i32);
                    }
                } else {
                    unsafe {
                        let input_down = INPUT {
                            r#type: INPUT_KEYBOARD,
                            Anonymous: INPUT_0 {
                                ki: KEYBDINPUT {
                                    wVk: VIRTUAL_KEY(0),
                                    wScan: ch as u16,
                                    dwFlags: KEYEVENTF_UNICODE,
                                    time: 0,
                                    dwExtraInfo: 0,
                                },
                            },
                        };
                        let input_up = INPUT {
                            r#type: INPUT_KEYBOARD,
                            Anonymous: INPUT_0 {
                                ki: KEYBDINPUT {
                                    wVk: VIRTUAL_KEY(0),
                                    wScan: ch as u16,
                                    dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                                    time: 0,
                                    dwExtraInfo: 0,
                                },
                            },
                        };
                        SendInput(&[input_down, input_up], std::mem::size_of::<INPUT>() as i32);
                    }
                }

                let jitter = ch as u64 % 8;
                let char_delay = if ch == ' ' || ch == '\n' {
                    base_delay + 15
                } else {
                    base_delay.saturating_sub(3) + jitter
                };

                std::thread::sleep(std::time::Duration::from_millis(char_delay));
            }

            IS_TYPING.store(false, Ordering::SeqCst);
            release_all_modifiers();
            info!("Stealth typing finished.");
            Ok(())
        }

        #[cfg(not(windows))]
        {
            IS_TYPING.store(false, Ordering::SeqCst);
            Err("Stealth typing supported on Windows.".to_string())
        }
    })
    .await
    .map_err(|e| format!("Typer error: {}", e))?
}
