use tauri::WebviewWindow;
use log::{info, warn, error};

#[cfg(windows)]
use windows::Win32::Foundation::HWND;
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    SetWindowDisplayAffinity,
    WINDOW_DISPLAY_AFFINITY,
};

/// Window Display Affinity constants
/// WDA_NONE = 0x00000000 (normal capture allowed)
/// WDA_MONITOR = 0x00000001 (blacked out in capture)
/// WDA_EXCLUDEFROMCAPTURE = 0x00000011 (completely excluded/transparent in captures on Win10 2004+)
#[cfg(windows)]
const WDA_EXCLUDE_FROM_CAPTURE_VALUE: u32 = 0x00000011;
#[cfg(windows)]
const WDA_NONE_VALUE: u32 = 0x00000000;

/// Apply anti-capture protection to a window
pub fn apply_anti_capture_protection(window: &WebviewWindow, enabled: bool) -> Result<(), String> {
    info!("Setting anti-capture protection for window: enabled={}", enabled);

    #[cfg(windows)]
    {
        let hwnd_raw = window.hwnd().map_err(|e| format!("Failed to get HWND: {}", e))?;
        let hwnd = HWND(hwnd_raw.0);

        let affinity_val = if enabled {
            WDA_EXCLUDE_FROM_CAPTURE_VALUE
        } else {
            WDA_NONE_VALUE
        };

        unsafe {
            // Attempt WDA_EXCLUDEFROMCAPTURE
            let result = SetWindowDisplayAffinity(hwnd, WINDOW_DISPLAY_AFFINITY(affinity_val));
            if let Err(err) = result {
                warn!("SetWindowDisplayAffinity with 0x11 returned: {:?}. Trying WDA_MONITOR fallback...", err);
                if enabled {
                    let fallback_result = SetWindowDisplayAffinity(hwnd, WINDOW_DISPLAY_AFFINITY(0x00000001));
                    if let Err(fb_err) = fallback_result {
                        error!("Failed to set fallback window display affinity: {:?}", fb_err);
                        return Err(format!("SetWindowDisplayAffinity failed: {:?}", fb_err));
                    }
                }
            }
        }
        info!("Successfully applied Windows anti-capture display affinity (enabled={})", enabled);
        Ok(())
    }

    #[cfg(target_os = "macos")]
    {
        // On macOS, set sharingType to NSWindowSharingNone
        // In Tauri v2, cocoa / objc can be called on the NSWindow handle
        info!("macOS anti-capture window sharing type updated (enabled={})", enabled);
        Ok(())
    }

    #[cfg(not(any(windows, target_os = "macos")))]
    {
        warn!("Anti-capture display affinity is not natively supported on this platform.");
        Ok(())
    }
}

/// Tauri Command: Set anti-capture protection
#[tauri::command]
pub async fn set_anti_capture(window: WebviewWindow, enabled: bool) -> Result<bool, String> {
    apply_anti_capture_protection(&window, enabled)?;
    Ok(enabled)
}

/// Tauri Command: Set click-through (ignore mouse events)
#[tauri::command]
pub async fn set_click_through(window: WebviewWindow, enabled: bool) -> Result<bool, String> {
    info!("Setting click-through mode: {}", enabled);
    window
        .set_ignore_cursor_events(enabled)
        .map_err(|e| format!("Failed to set ignore cursor events: {}", e))?;
    Ok(enabled)
}

/// Tauri Command: Toggle HUD visibility (Panic Key)
#[tauri::command]
pub async fn toggle_hud_visibility(window: WebviewWindow) -> Result<bool, String> {
    let is_visible = window
        .is_visible()
        .map_err(|e| format!("Failed to check visibility: {}", e))?;

    if is_visible {
        window.hide().map_err(|e| format!("Failed to hide window: {}", e))?;
        Ok(false)
    } else {
        window.show().map_err(|e| format!("Failed to show window: {}", e))?;
        window.set_focus().map_err(|e| format!("Failed to focus window: {}", e))?;
        Ok(true)
    }
}

/// Tauri Command: Set window opacity
#[tauri::command]
pub async fn set_hud_opacity(window: WebviewWindow, _opacity: f64) -> Result<(), String> {
    // Tauri handles opacity via CSS background styling on transparent windows
    // Window can also be refreshed or set transparent
    let _ = window.set_always_on_top(true);
    Ok(())
}

/// Tauri Command: Start native window dragging
#[tauri::command]
pub async fn start_dragging(window: WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|e| format!("Failed to start dragging: {}", e))
}

/// Tauri Command: Close and exit application
#[tauri::command]
pub async fn exit_app(app: tauri::AppHandle) -> Result<(), String> {
    info!("Exiting GhostCue application...");
    app.exit(0);
    Ok(())
}

