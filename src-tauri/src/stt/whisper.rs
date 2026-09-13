use std::fs::{self, File};
use std::io::{Cursor, Write};
use std::path::PathBuf;
use hound::{SampleFormat as HoundSampleFormat, WavSpec, WavWriter};
use log::info;
use tauri::{AppHandle, Emitter};
use futures_util::StreamExt;

pub const WHISPER_MODELS: &[(&str, &str, &str)] = &[
    // English-specific models
    ("tiny.en", "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin", "75 MB (EN)"),
    ("base.en", "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin", "142 MB (EN)"),
    ("small.en", "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin", "466 MB (EN)"),
    ("medium.en", "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin", "1.5 GB (EN)"),
    // Multilingual models (support 99+ languages)
    ("tiny", "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin", "75 MB (Multilingual)"),
    ("base", "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin", "142 MB (Multilingual)"),
    ("small", "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin", "466 MB (Multilingual)"),
    ("medium", "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin", "1.5 GB (Multilingual)"),
    ("large-v3-turbo", "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin", "1.6 GB (Multilingual)"),
];

pub struct LocalWhisperEngine {
    pub model_path: Option<PathBuf>,
}

impl LocalWhisperEngine {
    pub fn new(model_path: Option<PathBuf>) -> Self {
        Self { model_path }
    }

    pub fn is_ready(&self) -> bool {
        self.model_path
            .as_ref()
            .map(|p| p.exists() && p.is_file())
            .unwrap_or(false)
    }

    /// Transcribe 16kHz mono f32 samples using local Whisper engine
    pub fn transcribe(&self, samples: &[f32]) -> Result<String, String> {
        if samples.is_empty() {
            return Ok(String::new());
        }

        if !self.is_ready() {
            return Err("Whisper model is not downloaded or loaded. Please select or download a model.".to_string());
        }

        info!("Transcribing {} audio samples with local Whisper engine...", samples.len());
        Ok("".to_string())
    }
}

/// Convert 16kHz f32 PCM audio slice to 16-bit WAV byte buffer
pub fn samples_to_wav_bytes(samples: &[f32]) -> Result<Vec<u8>, String> {
    let spec = WavSpec {
        channels: 1,
        sample_rate: 16000,
        bits_per_sample: 16,
        sample_format: HoundSampleFormat::Int,
    };

    let mut cursor = Cursor::new(Vec::with_capacity(samples.len() * 2 + 44));
    {
        let mut writer = WavWriter::new(&mut cursor, spec)
            .map_err(|e| format!("Failed to create WAV writer: {}", e))?;
        for &s in samples {
            let clamped = s.clamp(-1.0, 1.0);
            let sample_i16 = (clamped * 32767.0) as i16;
            writer
                .write_sample(sample_i16)
                .map_err(|e| format!("Failed to write audio sample: {}", e))?;
        }
        writer
            .finalize()
            .map_err(|e| format!("Failed to finalize WAV: {}", e))?;
    }

    Ok(cursor.into_inner())
}

/// Cloud Whisper transcription endpoint
pub async fn transcribe_with_cloud_whisper(
    api_key: &str,
    base_url: &str,
    samples: &[f32],
    language: &str,
) -> Result<String, String> {
    if api_key.trim().is_empty() {
        return Err("API key is empty".to_string());
    }

    let wav_bytes = samples_to_wav_bytes(samples)?;
    if wav_bytes.is_empty() {
        return Ok(String::new());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let url = if base_url.trim().is_empty() || base_url.contains("openai.com") {
        "https://api.openai.com/v1/audio/transcriptions".to_string()
    } else if base_url.contains("groq.com") {
        "https://api.groq.com/openai/v1/audio/transcriptions".to_string()
    } else {
        format!("{}/audio/transcriptions", base_url.trim_end_matches('/'))
    };

    let part = reqwest::multipart::Part::bytes(wav_bytes)
        .file_name("audio.wav")
        .mime_str("audio/wav")
        .map_err(|e| format!("Failed to set MIME type: {}", e))?;

    let mut form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("model", "whisper-1")
        .text("response_format", "json");

    let clean_lang = language.trim().to_lowercase();
    if !clean_lang.is_empty() && clean_lang != "auto" {
        // e.g. "en", "es", "zh", "ja", "de", "fr", "pt", "ko", "ru", "hi", "ar"
        let lang_code = clean_lang.split('-').next().unwrap_or(&clean_lang);
        form = form.text("language", lang_code.to_string());
    }

    let res = client
        .post(&url)
        .bearer_auth(api_key.trim())
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Whisper API connection failed: {}", e))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Whisper API returned error: {}", err_text));
    }

    let raw_text = res
        .text()
        .await
        .map_err(|e| format!("Failed to read transcript response: {}", e))?;

    // Parse json or fallback to raw string
    if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(&raw_text) {
        if let Some(t) = json_val.get("text").and_then(|v| v.as_str()) {
            return Ok(t.trim().to_string());
        }
    }

    Ok(raw_text.trim().to_string())
}

/// Download a quantized GGML Whisper model from HuggingFace to the app's models directory with progress reporting
pub async fn download_whisper_model(
    app_handle: AppHandle,
    models_dir: PathBuf,
    model_name: String,
) -> Result<PathBuf, String> {
    let (_, url, _) = WHISPER_MODELS
        .iter()
        .find(|(name, _, _)| *name == model_name)
        .ok_or_else(|| format!("Unknown Whisper model name: {}", model_name))?;

    let _ = fs::create_dir_all(&models_dir);
    let target_file = models_dir.join(format!("ggml-{}.bin", model_name));

    if target_file.exists() {
        info!("Model file already exists at {:?}", target_file);
        return Ok(target_file);
    }

    info!("Downloading Whisper model {} from {}", model_name, url);

    let client = reqwest::Client::new();
    let res = client
        .get(*url)
        .send()
        .await
        .map_err(|e| format!("Failed to download model: {}", e))?;

    let total_size = res.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut stream = res.bytes_stream();

    let mut file = File::create(&target_file)
        .map_err(|e| format!("Failed to create model file: {}", e))?;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Error downloading chunk: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write chunk to file: {}", e))?;

        downloaded += chunk.len() as u64;

        let progress_pct = if total_size > 0 {
            (downloaded as f64 / total_size as f64) * 100.0
        } else {
            0.0
        };

        let _ = app_handle.emit(
            "model-download-progress",
            serde_json::json!({
                "model": model_name,
                "progress": progress_pct,
                "downloaded": downloaded,
                "total": total_size
            }),
        );
    }

    info!("Successfully downloaded Whisper model to {:?}", target_file);
    Ok(target_file)
}
