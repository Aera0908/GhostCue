use std::fs::{self, File};
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use hound::{SampleFormat as HoundSampleFormat, WavSpec, WavWriter};
use log::info;
use tauri::{AppHandle, Emitter};
use futures_util::StreamExt;
use base64::Engine;

#[derive(Debug, Clone)]
pub struct WhisperModelDef {
    pub name: &'static str,
    pub url: &'static str,
    pub display_size: &'static str,
    pub min_bytes: u64,
}

pub const WHISPER_MODELS: &[WhisperModelDef] = &[
    // English-specific models (Optimized & Fast)
    WhisperModelDef { name: "tiny.en", url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin", display_size: "75 MB (EN, Fastest)", min_bytes: 70_000_000 },
    WhisperModelDef { name: "base.en", url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin", display_size: "142 MB (EN, Recommended)", min_bytes: 135_000_000 },
    WhisperModelDef { name: "small.en", url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin", display_size: "466 MB (EN, Accurate)", min_bytes: 450_000_000 },
    WhisperModelDef { name: "medium.en", url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin", display_size: "1.5 GB (EN, High Precision)", min_bytes: 1_400_000_000 },
    // Multilingual models (Support 99+ languages including Tagalog, Spanish, Chinese, Japanese, etc.)
    WhisperModelDef { name: "tiny", url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin", display_size: "75 MB (Multilingual, Fast)", min_bytes: 70_000_000 },
    WhisperModelDef { name: "base", url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin", display_size: "142 MB (Multilingual, Recommended)", min_bytes: 135_000_000 },
    WhisperModelDef { name: "small", url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin", display_size: "466 MB (Multilingual, Accurate)", min_bytes: 450_000_000 },
    WhisperModelDef { name: "medium", url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin", display_size: "1.5 GB (Multilingual, High Precision)", min_bytes: 1_400_000_000 },
    WhisperModelDef { name: "large-v3-turbo", url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin", display_size: "1.6 GB (Multilingual, Heavy on CPU)", min_bytes: 1_500_000_000 },
];

pub fn get_model_min_bytes(name: &str) -> u64 {
    WHISPER_MODELS
        .iter()
        .find(|m| m.name == name)
        .map(|m| m.min_bytes)
        .unwrap_or(50_000_000)
}

pub fn is_valid_model_file(path: &Path, model_name: &str) -> bool {
    if !path.exists() || !path.is_file() {
        return false;
    }
    let min_bytes = get_model_min_bytes(model_name);
    match path.metadata() {
        Ok(m) => m.len() >= min_bytes,
        Err(_) => false,
    }
}

/// Discovers a valid local Whisper model, falling back to any working downloaded model if the preferred one is corrupt or missing
pub fn find_valid_model_path(preferred_path: Option<&Path>, preferred_size: &str) -> Option<PathBuf> {
    // 1. Try preferred path
    if let Some(p) = preferred_path {
        if !preferred_size.is_empty() && is_valid_model_file(p, preferred_size) {
            return Some(p.to_path_buf());
        }
        // Even if preferred_size is empty, check if p has at least 50MB
        if p.exists() && p.is_file() && p.metadata().map(|m| m.len()).unwrap_or(0) >= 50_000_000 {
            return Some(p.to_path_buf());
        }
    }

    // 2. Search APPDATA models folder
    if let Ok(appdata) = std::env::var("APPDATA") {
        let models_dir = PathBuf::from(appdata).join("com.ghostcue.app").join("models");
        
        let priority_sizes = [
            preferred_size,
            "base.en",
            "tiny.en",
            "small.en",
            "base",
            "tiny",
            "small",
            "medium.en",
            "large-v3-turbo",
        ];

        for size in priority_sizes {
            if size.is_empty() {
                continue;
            }
            let candidate = models_dir.join(format!("ggml-{}.bin", size));
            if is_valid_model_file(&candidate, size) {
                return Some(candidate);
            }
        }
    }

    None
}

pub struct LocalWhisperEngine {
    pub model_path: Option<PathBuf>,
}

impl LocalWhisperEngine {
    pub fn new(model_path: Option<PathBuf>) -> Self {
        Self { model_path }
    }

    pub fn is_ready(&self) -> bool {
        find_valid_model_path(self.model_path.as_deref(), "").is_some()
    }

    /// Finds whisper-cli.exe executable path
    pub fn find_whisper_cli(&self) -> Option<PathBuf> {
        // 1. Check relative to model_path: models/../bin/whisper-cli.exe
        if let Some(ref m_path) = self.model_path {
            if let Some(models_dir) = m_path.parent() {
                if let Some(app_dir) = models_dir.parent() {
                    let cli = app_dir.join("bin").join("whisper-cli.exe");
                    if cli.exists() {
                        return Some(cli);
                    }
                    let main_exe = app_dir.join("bin").join("main.exe");
                    if main_exe.exists() {
                        return Some(main_exe);
                    }
                }
                let cli_same = models_dir.join("whisper-cli.exe");
                if cli_same.exists() {
                    return Some(cli_same);
                }
            }
        }

        // 2. Check standard Windows AppData Roaming location
        if let Ok(appdata) = std::env::var("APPDATA") {
            let app_data_bin = PathBuf::from(appdata)
                .join("com.ghostcue.app")
                .join("bin")
                .join("whisper-cli.exe");
            if app_data_bin.exists() {
                return Some(app_data_bin);
            }
        }

        None
    }

    /// Transcribe 16kHz mono f32 samples using local Whisper engine (whisper-cli)
    pub fn transcribe(&self, samples: &[f32], language: &str) -> Result<String, String> {
        if samples.is_empty() {
            return Ok(String::new());
        }

        let model_path = find_valid_model_path(self.model_path.as_deref(), "")
            .ok_or_else(|| "No valid Whisper model found on disk. Please select or download a model in Settings.".to_string())?;

        let cli_path = self.find_whisper_cli().ok_or_else(|| {
            "whisper-cli binary not found in bin directory. Please check that whisper-cli.exe is installed.".to_string()
        })?;

        // Write audio samples to a temporary 16kHz mono WAV file
        let temp_dir = std::env::temp_dir();
        let temp_wav = temp_dir.join(format!("ghostcue_stt_{}.wav", uuid::Uuid::new_v4()));

        let spec = WavSpec {
            channels: 1,
            sample_rate: 16000,
            bits_per_sample: 16,
            sample_format: HoundSampleFormat::Int,
        };

        {
            let mut writer = WavWriter::create(&temp_wav, spec)
                .map_err(|e| format!("Failed to create temp audio file: {}", e))?;
            for &s in samples {
                let clamped = s.clamp(-1.0, 1.0);
                let sample_i16 = (clamped * 32767.0) as i16;
                writer.write_sample(sample_i16).map_err(|e| format!("Failed to write audio sample: {}", e))?;
            }
            writer.finalize().map_err(|e| format!("Failed to finalize WAV: {}", e))?;
        }

        // Determine optimal CPU threads: clamp between 2 and 8 for responsive CPU inference
        let thread_count = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4)
            .clamp(2, 8);

        let mut cmd = std::process::Command::new(&cli_path);
        cmd.arg("-m")
            .arg(&model_path)
            .arg("-f")
            .arg(&temp_wav)
            .arg("-t")
            .arg(thread_count.to_string())
            .arg("-nt")
            .arg("-np");

        // Supply language if using a multilingual model (doesn't contain '.en.')
        let model_str = model_path.to_string_lossy().to_lowercase();
        if !model_str.contains(".en.") {
            let clean_lang = language.trim().to_lowercase();
            if !clean_lang.is_empty() && clean_lang != "auto" {
                let lang_code = clean_lang.split('-').next().unwrap_or(&clean_lang);
                cmd.arg("-l").arg(lang_code);
            }
        }

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW prevents command prompt window popup
        }

        let output_res = cmd.output();
        let _ = std::fs::remove_file(&temp_wav);

        match output_res {
            Ok(out) => {
                if !out.status.success() {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    return Err(format!("Local whisper execution error: {}", stderr));
                }
                let raw_stdout = String::from_utf8_lossy(&out.stdout);
                let cleaned = raw_stdout.trim().to_string();

                // Suppress non-speech noise and hallucination tokens
                let lower = cleaned.to_lowercase();
                if lower == "." || lower == ".." || lower == "..."
                    || lower.starts_with("(phone") || lower.starts_with("(electronic")
                    || lower.starts_with("(music") || lower.starts_with("(beep")
                    || lower.starts_with("[blank_audio]") || lower == "(applause)"
                    || lower == "(laughter)" || lower == "[silence]"
                {
                    return Ok(String::new());
                }

                info!("✓ Local Whisper STT transcribed ({:?}): '{}'", model_path.file_name().unwrap_or_default(), cleaned);
                Ok(cleaned)
            }
            Err(e) => Err(format!("Failed to run whisper-cli: {}", e)),
        }
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

static SHARED_STT_CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();

fn get_shared_stt_client() -> &'static reqwest::Client {
    SHARED_STT_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .tcp_keepalive(std::time::Duration::from_secs(60))
            .pool_idle_timeout(std::time::Duration::from_secs(90))
            .pool_max_idle_per_host(5)
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    })
}

/// Cloud Whisper (OpenAI-compatible) transcription endpoint
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

    let client = get_shared_stt_client();

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

    let model_name = if url.contains("groq.com") {
        "whisper-large-v3-turbo"
    } else {
        "whisper-1"
    };

    let mut form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("model", model_name)
        .text("response_format", "json");

    let clean_lang = language.trim().to_lowercase();
    if !clean_lang.is_empty() && clean_lang != "auto" {
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
        return Err(format!("Whisper API error: {}", err_text));
    }

    let raw_text = res
        .text()
        .await
        .map_err(|e| format!("Failed to read transcript response: {}", e))?;

    if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(&raw_text) {
        if let Some(t) = json_val.get("text").and_then(|v| v.as_str()) {
            return Ok(t.trim().to_string());
        }
    }

    Ok(raw_text.trim().to_string())
}

/// Groq Cloud Whisper transcription endpoint (100% Free API, ultra-fast ~200ms latency)
pub async fn transcribe_with_groq_whisper(
    api_key: &str,
    model: &str,
    samples: &[f32],
    language: &str,
) -> Result<String, String> {
    if api_key.trim().is_empty() {
        return Err("Groq API key is empty. Please enter your free Groq API key in Settings (get one at console.groq.com).".to_string());
    }

    let wav_bytes = samples_to_wav_bytes(samples)?;
    if wav_bytes.is_empty() {
        return Ok(String::new());
    }

    let client = get_shared_stt_client();

    let part = reqwest::multipart::Part::bytes(wav_bytes)
        .file_name("audio.wav")
        .mime_str("audio/wav")
        .map_err(|e| format!("Failed to set MIME type: {}", e))?;

    let model_name = if model.trim().is_empty() {
        "whisper-large-v3-turbo"
    } else {
        model.trim()
    };

    let mut form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("model", model_name.to_string())
        .text("response_format", "json");

    let clean_lang = language.trim().to_lowercase();
    if !clean_lang.is_empty() && clean_lang != "auto" {
        let lang_code = clean_lang.split('-').next().unwrap_or(&clean_lang);
        form = form.text("language", lang_code.to_string());
    }

    let res = client
        .post("https://api.groq.com/openai/v1/audio/transcriptions")
        .bearer_auth(api_key.trim())
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Groq Whisper connection failed: {}", e))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Groq Whisper API error: {}", err_text));
    }

    let val: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse Groq response: {}", e))?;

    let text = val["text"].as_str().unwrap_or("").trim().to_string();
    info!("✓ Groq Whisper STT transcribed: '{}'", text);
    Ok(text)
}

/// OpenRouter multimodal audio transcription endpoint
pub async fn transcribe_with_openrouter(
    api_key: &str,
    model: &str,
    samples: &[f32],
    language: &str,
) -> Result<String, String> {
    if api_key.trim().is_empty() {
        return Err("OpenRouter API key is empty. Please enter your OpenRouter key in Settings.".to_string());
    }

    let wav_bytes = samples_to_wav_bytes(samples)?;
    if wav_bytes.is_empty() {
        return Ok(String::new());
    }

    let b64_audio = base64::engine::general_purpose::STANDARD.encode(&wav_bytes);
    let client = get_shared_stt_client();

    let target_model = if model.trim().is_empty() {
        "google/gemini-2.5-flash"
    } else {
        model.trim()
    };

    let lang_hint = if !language.is_empty() && language != "auto" {
        format!(" The spoken language is {}.", language)
    } else {
        String::new()
    };

    let prompt = format!("Transcribe the spoken audio verbatim. Output ONLY the transcribed text, nothing else. If there is no speech, output an empty string.{}", lang_hint);

    let payload = serde_json::json!({
        "model": target_model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": prompt
                    },
                    {
                        "type": "input_audio",
                        "input_audio": {
                            "data": b64_audio,
                            "format": "wav"
                        }
                    }
                ]
            }
        ]
    });

    let res = client
        .post("https://openrouter.ai/api/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key.trim()))
        .header("HTTP-Referer", "https://ghostcue.app")
        .header("X-Title", "GhostCue")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("OpenRouter audio API connection failed: {}", e))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        if err_text.contains("at least $0.50") {
            return Err("OpenRouter requires at least $0.50 credit balance for audio processing. Please add credits at openrouter.ai/settings, or use Local Whisper GGML / Groq Whisper for 100% free transcription.".to_string());
        }
        return Err(format!("OpenRouter audio transcription error: {}", err_text));
    }

    let val: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse OpenRouter response: {}", e))?;

    let text = val["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();

    info!("✓ OpenRouter Audio STT transcribed: '{}'", text);
    Ok(text)
}

/// Download a quantized GGML Whisper model from HuggingFace to the app's models directory with progress reporting
pub async fn download_whisper_model(
    app_handle: AppHandle,
    models_dir: PathBuf,
    model_name: String,
) -> Result<PathBuf, String> {
    let model_def = WHISPER_MODELS
        .iter()
        .find(|m| m.name == model_name)
        .ok_or_else(|| format!("Unknown Whisper model name: {}", model_name))?;

    let _ = fs::create_dir_all(&models_dir);
    let target_file = models_dir.join(format!("ggml-{}.bin", model_name));
    let part_file = models_dir.join(format!("ggml-{}.bin.part", model_name));

    // If target exists and meets min size, reuse it
    if target_file.exists() && target_file.metadata().map(|m| m.len()).unwrap_or(0) >= model_def.min_bytes {
        info!("Model file already exists and is valid at {:?}", target_file);
        return Ok(target_file);
    }

    // Delete any incomplete target or part file before starting fresh download
    let _ = fs::remove_file(&target_file);
    let _ = fs::remove_file(&part_file);

    info!("Downloading Whisper model {} from {}", model_name, model_def.url);

    let client = reqwest::Client::new();
    let res = client
        .get(model_def.url)
        .send()
        .await
        .map_err(|e| format!("Failed to download model: {}", e))?;

    let total_size = res.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut stream = res.bytes_stream();

    let mut file = File::create(&part_file)
        .map_err(|e| format!("Failed to create temporary model download file: {}", e))?;

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

    drop(file);

    // Verify downloaded size before finalizing
    if downloaded < model_def.min_bytes {
        let _ = fs::remove_file(&part_file);
        return Err(format!("Download was incomplete: got {} bytes, expected at least {} bytes", downloaded, model_def.min_bytes));
    }

    // Atomically move .part to .bin
    fs::rename(&part_file, &target_file)
        .map_err(|e| format!("Failed to finalize model file: {}", e))?;

    info!("Successfully downloaded and verified Whisper model at {:?}", target_file);
    Ok(target_file)
}
