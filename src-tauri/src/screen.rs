use serde::{Deserialize, Serialize};
use log::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenCaptureResult {
    pub base64_image: String,
    pub width: u32,
    pub height: u32,
    pub format: String,
    #[serde(default)]
    pub screen_hash: String,
    #[serde(default)]
    pub extracted_text: String,
}

#[cfg(windows)]
use windows::Win32::Foundation::HWND;
#[cfg(windows)]
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject,
    GetDC, GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER,
    BI_RGB, DIB_RGB_COLORS, ROP_CODE, SRCCOPY,
};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN,
};

#[cfg(windows)]
pub fn capture_desktop_rgb() -> Result<(Vec<u8>, u32, u32), String> {
    unsafe {
        let hdc_screen = GetDC(HWND::default());
        if hdc_screen.is_invalid() {
            return Err("Failed to get desktop device context (GetDC returned invalid handle)".to_string());
        }

        let width = GetSystemMetrics(SM_CXSCREEN);
        let height = GetSystemMetrics(SM_CYSCREEN);

        if width <= 0 || height <= 0 {
            ReleaseDC(HWND::default(), hdc_screen);
            return Err(format!("Invalid desktop dimensions detected: {}x{}", width, height));
        }

        let hdc_mem = CreateCompatibleDC(hdc_screen);
        if hdc_mem.is_invalid() {
            ReleaseDC(HWND::default(), hdc_screen);
            return Err("Failed to create compatible memory DC".to_string());
        }

        let hbm_screen = CreateCompatibleBitmap(hdc_screen, width, height);
        if hbm_screen.is_invalid() {
            let _ = DeleteDC(hdc_mem);
            ReleaseDC(HWND::default(), hdc_screen);
            return Err("Failed to create compatible bitmap for screen capture".to_string());
        }

        let hbm_old = SelectObject(hdc_mem, hbm_screen);

        // BitBlt with CAPTUREBLT to capture layered and hardware-accelerated windows
        let rop_capture = ROP_CODE(SRCCOPY.0 | 0x40000000);
        let bitblt_res = BitBlt(hdc_mem, 0, 0, width, height, hdc_screen, 0, 0, rop_capture);
        if bitblt_res.is_err() {
            // Fallback to standard SRCCOPY if display driver rejects CAPTUREBLT
            let fallback_res = BitBlt(hdc_mem, 0, 0, width, height, hdc_screen, 0, 0, SRCCOPY);
            if fallback_res.is_err() {
                SelectObject(hdc_mem, hbm_old);
                let _ = DeleteObject(hbm_screen);
                let _ = DeleteDC(hdc_mem);
                ReleaseDC(HWND::default(), hdc_screen);
                return Err(format!("BitBlt failed to copy desktop screen: {:?}", bitblt_res));
            }
        }

        // Deselect bitmap before calling GetDIBits
        SelectObject(hdc_mem, hbm_old);

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height, // Negative value indicates top-down DIB
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };

        let mut bgra_buf: Vec<u8> = vec![0u8; (width as usize) * (height as usize) * 4];

        let mut lines_copied = GetDIBits(
            hdc_mem,
            hbm_screen,
            0,
            height as u32,
            Some(bgra_buf.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        let mut is_bottom_up = false;
        if lines_copied == 0 {
            // Some graphics drivers reject negative biHeight; retry with positive biHeight (bottom-up DIB)
            bmi.bmiHeader.biHeight = height;
            lines_copied = GetDIBits(
                hdc_mem,
                hbm_screen,
                0,
                height as u32,
                Some(bgra_buf.as_mut_ptr() as *mut _),
                &mut bmi,
                DIB_RGB_COLORS,
            );
            is_bottom_up = true;
        }

        // Clean up GDI handles immediately
        let _ = DeleteObject(hbm_screen);
        let _ = DeleteDC(hdc_mem);
        ReleaseDC(HWND::default(), hdc_screen);

        if lines_copied == 0 {
            return Err("GetDIBits failed to copy pixel data from screen bitmap".to_string());
        }

        // Convert BGRA directly to RGB
        let mut rgb_buf = Vec::with_capacity((width as usize) * (height as usize) * 3);
        if is_bottom_up {
            let row_stride = (width as usize) * 4;
            for row in (0..height as usize).rev() {
                let start = row * row_stride;
                for chunk in bgra_buf[start..start + row_stride].chunks_exact(4) {
                    rgb_buf.push(chunk[2]); // R
                    rgb_buf.push(chunk[1]); // G
                    rgb_buf.push(chunk[0]); // B
                }
            }
        } else {
            for chunk in bgra_buf.chunks_exact(4) {
                rgb_buf.push(chunk[2]); // R
                rgb_buf.push(chunk[1]); // G
                rgb_buf.push(chunk[0]); // B
            }
        }

        Ok((rgb_buf, width as u32, height as u32))
    }
}

#[cfg(not(windows))]
pub fn capture_desktop_rgb() -> Result<(Vec<u8>, u32, u32), String> {
    Err("Native screen capture is currently implemented for Windows targets.".to_string())
}

#[cfg(windows)]
pub fn extract_text_from_jpeg_bytes(jpeg_bytes: &[u8]) -> Result<String, String> {
    use windows::Storage::Streams::{InMemoryRandomAccessStream, DataWriter};
    use windows::Graphics::Imaging::BitmapDecoder;
    use windows::Media::Ocr::OcrEngine;

    let stream = InMemoryRandomAccessStream::new()
        .map_err(|e| format!("Failed to create InMemoryRandomAccessStream: {:?}", e))?;

    let writer = DataWriter::CreateDataWriter(&stream)
        .map_err(|e| format!("Failed to create DataWriter: {:?}", e))?;

    writer.WriteBytes(jpeg_bytes)
        .map_err(|e| format!("Failed to write bytes to stream: {:?}", e))?;

    writer.StoreAsync()
        .map_err(|e| format!("DataWriter.StoreAsync failed: {:?}", e))?
        .get()
        .map_err(|e| format!("DataWriter store failed: {:?}", e))?;

    writer.DetachStream()
        .map_err(|e| format!("Failed to detach stream: {:?}", e))?;

    stream.Seek(0)
        .map_err(|e| format!("Seek(0) failed: {:?}", e))?;

    let decoder = BitmapDecoder::CreateAsync(&stream)
        .map_err(|e| format!("BitmapDecoder::CreateAsync failed: {:?}", e))?
        .get()
        .map_err(|e| format!("BitmapDecoder get failed: {:?}", e))?;

    let software_bitmap = decoder.GetSoftwareBitmapAsync()
        .map_err(|e| format!("GetSoftwareBitmapAsync failed: {:?}", e))?
        .get()
        .map_err(|e| format!("GetSoftwareBitmap failed: {:?}", e))?;

    let engine = OcrEngine::TryCreateFromUserProfileLanguages()
        .map_err(|e| format!("OcrEngine::TryCreateFromUserProfileLanguages failed: {:?}", e))?;

    let result = engine.RecognizeAsync(&software_bitmap)
        .map_err(|e| format!("RecognizeAsync failed: {:?}", e))?
        .get()
        .map_err(|e| format!("OCR Recognize failed: {:?}", e))?;

    let text = result.Text()
        .map_err(|e| format!("Failed to read OCR text: {:?}", e))?
        .to_string();

    Ok(text)
}

#[cfg(not(windows))]
pub fn extract_text_from_jpeg_bytes(_jpeg_bytes: &[u8]) -> Result<String, String> {
    Err("Native local OCR is implemented for Windows platforms.".to_string())
}

/// Compute a 64-bit difference hash (dHash) for screen change detection
fn compute_screen_dhash(img: &image::ImageBuffer<image::Rgb<u8>, Vec<u8>>) -> u64 {
    let tiny = image::imageops::resize(
        img,
        9,
        8,
        image::imageops::FilterType::Nearest,
    );
    let mut hash: u64 = 0;
    for y in 0..8 {
        for x in 0..8 {
            let p1 = tiny.get_pixel(x, y);
            let p2 = tiny.get_pixel(x + 1, y);
            let l1 = (p1[0] as u32 * 299 + p1[1] as u32 * 587 + p1[2] as u32 * 114) / 1000;
            let l2 = (p2[0] as u32 * 299 + p2[1] as u32 * 587 + p2[2] as u32 * 114) / 1000;
            if l1 < l2 {
                hash |= 1 << (y * 8 + x);
            }
        }
    }
    hash
}

/// Capture desktop screen and encode to JPEG base64
pub fn capture_screen_jpeg_base64() -> Result<ScreenCaptureResult, String> {
    let (rgb_buf, width, height) = capture_desktop_rgb()?;
    info!("Captured desktop screen: {}x{} ({} bytes RGB)", width, height, rgb_buf.len());

    let img = image::ImageBuffer::<image::Rgb<u8>, _>::from_raw(width, height, rgb_buf)
        .ok_or_else(|| "Failed to construct ImageBuffer from raw RGB screen buffer".to_string())?;

    // Downscale if width exceeds 1920px
    let final_img = if width > 1920 {
        let target_width = 1920u32;
        let target_height = ((height as f32) * (1920.0 / width as f32)).round() as u32;
        info!("Downscaling screenshot from {}x{} to {}x{}", width, height, target_width, target_height);
        image::imageops::resize(&img, target_width, target_height, image::imageops::FilterType::Nearest)
    } else {
        img
    };

    let final_w = final_img.width();
    let final_h = final_img.height();

    // Fast screen difference hash
    let screen_hash = format!("{:016x}", compute_screen_dhash(&final_img));

    let mut jpeg_bytes = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut jpeg_bytes);
    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut cursor, 80);
    encoder.encode(
        final_img.as_raw(),
        final_w,
        final_h,
        image::ExtendedColorType::Rgb8,
    ).map_err(|e| format!("Failed to encode screenshot to JPEG: {}", e))?;

    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&jpeg_bytes);
    info!("Screenshot successfully encoded to JPEG base64 ({} KB, hash: {})", jpeg_bytes.len() / 1024, screen_hash);

    // Extract text using native Windows OCR
    let extracted_text = match extract_text_from_jpeg_bytes(&jpeg_bytes) {
        Ok(raw_text) => {
            let mut cleaned_lines = Vec::new();
            for line in raw_text.lines() {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    cleaned_lines.push(trimmed);
                }
            }
            let cleaned = cleaned_lines.join("\n");
            info!("Native OCR extracted {} characters from screen", cleaned.len());
            cleaned
        }
        Err(e) => {
            log::warn!("Local native OCR warning: {}. Continuing without text.", e);
            String::new()
        }
    };

    Ok(ScreenCaptureResult {
        base64_image: b64,
        width: final_w,
        height: final_h,
        format: "image/jpeg".to_string(),
        screen_hash,
        extracted_text,
    })
}

#[tauri::command]
pub async fn capture_screen_for_ocr() -> Result<ScreenCaptureResult, String> {
    tokio::task::spawn_blocking(capture_screen_jpeg_base64)
        .await
        .map_err(|e| format!("Screen capture task join error: {}", e))?
}

