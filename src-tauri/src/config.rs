use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use log::{info, warn};
use parking_lot::{Mutex, RwLock};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::config_migrate::migrate_v1;
use crate::secrets::{KeyId, SecretStore};
use crate::state::AppState;

pub const CONFIG_VERSION: u32 = 2;
pub const CONFIG_FILE: &str = "ghostcue_config.json";

/// Saved settings. API keys are not part of this struct: they live in the secret store.
/// `#[serde(default)]` means a missing field takes its default instead of failing the load.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct AppConfig {
    pub config_version: u32,

    // Window & Stealth
    pub anti_capture_enabled: bool,
    pub focus_shield_enabled: bool,
    pub opacity: f64,
    pub click_through: bool,
    pub always_on_top: bool,
    pub font_size: u32,

    // Audio Devices
    pub audio_input_device: Option<String>,
    pub audio_output_device: Option<String>,
    pub mic_enabled: bool,
    pub loopback_enabled: bool,

    // VAD
    pub vad_sensitivity: f32,
    pub vad_speech_threshold_ms: u64,
    pub vad_silence_cutoff_ms: u64,

    // Language & Localization
    pub ui_language: String,
    pub stt_language: String,
    pub stt_languages: Vec<String>,
    pub response_language: String,

    // STT Engine
    pub stt_provider: String, // "cloud_whisper" | "local_whisper" | "deepgram" | "groq" | "openrouter" | "mock"
    pub whisper_model_path: String,
    pub whisper_model_size: String,
    pub groq_whisper_model: String,

    // LLM Provider
    pub llm_provider: String, // a slug from llm::provider
    pub gemini_model: String,
    pub ollama_endpoint: String,
    pub ollama_model: String,
    pub openai_model: String,
    pub openai_base_url: String,
    pub anthropic_model: String,
    pub deepseek_model: String,
    pub groq_model: String,
    pub custom_endpoint: String,
    pub custom_model: String,
    pub openrouter_model: String,
    /// Used only when `smart_model_routing` is on: provider slug -> model for code and screen tasks.
    pub code_models: BTreeMap<String, String>,
    pub smart_model_routing: bool,

    // Interview Context & Prompts
    pub target_role: String,
    pub company_name: String,
    pub interview_title: String,
    pub job_description: String,
    pub candidate_resume: String,
    pub project_directory: String,
    pub project_directories: Vec<String>,
    pub project_context: String,
    pub system_prompt_override: String,
    pub auto_trigger_enabled: bool,
    pub auto_trigger_delay_ms: u64,
    pub live_ocr_enabled: bool,
    pub live_ocr_interval_secs: u64,
    pub live_ocr_smart_diff: bool,
    pub max_context_turns: usize,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            config_version: CONFIG_VERSION,

            anti_capture_enabled: true,
            focus_shield_enabled: true,
            opacity: 0.92,
            click_through: false,
            always_on_top: true,
            font_size: 14,

            audio_input_device: None,
            audio_output_device: None,
            mic_enabled: true,
            loopback_enabled: true,

            vad_sensitivity: 0.5,
            vad_speech_threshold_ms: 300,
            vad_silence_cutoff_ms: 1600,

            ui_language: "en".to_string(),
            stt_language: "auto".to_string(),
            stt_languages: vec!["en".to_string(), "tl".to_string()],
            response_language: "auto".to_string(),

            stt_provider: "local_whisper".to_string(),
            whisper_model_path: String::new(),
            whisper_model_size: "base.en".to_string(),
            groq_whisper_model: "whisper-large-v3-turbo".to_string(),

            llm_provider: "gemini".to_string(),
            gemini_model: "gemini-2.5-flash".to_string(),
            ollama_endpoint: "http://localhost:11434".to_string(),
            ollama_model: String::new(),
            openai_model: "gpt-4o".to_string(),
            openai_base_url: "https://api.openai.com/v1".to_string(),
            anthropic_model: "claude-opus-5-5".to_string(),
            deepseek_model: "deepseek-chat".to_string(),
            groq_model: "llama-3.3-70b-versatile".to_string(),
            custom_endpoint: String::new(),
            custom_model: String::new(),
            openrouter_model: "deepseek/deepseek-chat".to_string(),
            code_models: BTreeMap::new(),
            smart_model_routing: false,

            target_role: "Senior Software Engineer".to_string(),
            company_name: String::new(),
            interview_title: String::new(),
            job_description: "Full Stack / Distributed Systems Engineer. Tech: Rust, TypeScript, React, System Design, Algorithms.".to_string(),
            candidate_resume: "Experienced engineer with 6+ years in backend systems, high-concurrency microservices, TypeScript, and modern frontend frameworks.".to_string(),
            project_directory: String::new(),
            project_directories: Vec::new(),
            project_context: String::new(),
            system_prompt_override: String::new(),
            auto_trigger_enabled: true,
            auto_trigger_delay_ms: 1500,
            live_ocr_enabled: false,
            live_ocr_interval_secs: 10,
            live_ocr_smart_diff: true,
            max_context_turns: 10,
        }
    }
}

/// Where the settings file lives. Debug builds use a `dev` subfolder so that working on
/// the app never rewrites the settings of the installed copy.
pub fn settings_dir(app_data_dir: PathBuf, debug_build: bool) -> PathBuf {
    if debug_build {
        app_data_dir.join("dev")
    } else {
        app_data_dir
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum LoadOutcome {
    /// No settings file existed.
    Fresh,
    Loaded,
    /// An old-format file was read. It is rewritten only once every key is safely stored.
    Migrated,
    /// The file could not be understood. It was set aside and defaults are in use.
    Quarantined { backup: PathBuf },
}

pub struct ConfigManager {
    config: Arc<RwLock<AppConfig>>,
    config_path: PathBuf,
    notice: Mutex<Option<String>>,
    save_lock: Mutex<()>,
}

impl ConfigManager {
    pub fn load(app_dir: PathBuf, secrets: &dyn SecretStore) -> (ConfigManager, LoadOutcome, Option<String>) {
        Self::load_with_env(app_dir, secrets, None)
    }

    /// `dev_env` is the text of a `.env` file. Debug builds pass the repository's own; release builds pass `None`.
    pub fn load_with_env(
        app_dir: PathBuf,
        secrets: &dyn SecretStore,
        dev_env: Option<&str>,
    ) -> (ConfigManager, LoadOutcome, Option<String>) {
        let config_path = app_dir.join(CONFIG_FILE);
        let (mut config, outcome, notice) = read_config(&config_path, secrets);
        if let Some(text) = dev_env {
            apply_dev_env(text, &mut config, secrets);
        }
        info!("Settings loaded ({outcome:?}), answer provider: {}", config.llm_provider);
        let manager = ConfigManager {
            config: Arc::new(RwLock::new(config)),
            config_path,
            notice: Mutex::new(notice.clone()),
            save_lock: Mutex::new(()),
        };
        (manager, outcome, notice)
    }

    pub fn get_config(&self) -> AppConfig {
        self.config.read().clone()
    }

    /// Writes to disk first. Memory changes only when the write succeeded.
    pub fn update_config(&self, mut new_config: AppConfig) -> Result<(), String> {
        new_config.config_version = CONFIG_VERSION;
        let _saving = self.save_lock.lock();
        write_atomic(&self.config_path, &new_config)?;
        *self.config.write() = new_config;
        Ok(())
    }

    /// The message produced while loading, returned once.
    pub fn take_notice(&self) -> Option<String> {
        self.notice.lock().take()
    }
}

fn read_config(path: &Path, secrets: &dyn SecretStore) -> (AppConfig, LoadOutcome, Option<String>) {
    if !path.exists() {
        return (AppConfig::default(), LoadOutcome::Fresh, None);
    }
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(err) => {
            warn!("Settings file could not be read: {err}");
            return (
                AppConfig::default(),
                LoadOutcome::Fresh,
                Some("Your settings file could not be read, so default settings are in use.".to_string()),
            );
        }
    };

    let raw: serde_json::Value = match serde_json::from_slice(&bytes) {
        Ok(value) => value,
        Err(err) => return quarantined(path, &err.to_string()),
    };
    let version = raw.get("config_version").and_then(|v| v.as_u64()).unwrap_or(1);

    if raw.is_object() && version >= u64::from(CONFIG_VERSION) {
        return match serde_json::from_value::<AppConfig>(raw) {
            Ok(config) => (config, LoadOutcome::Loaded, None),
            Err(err) => quarantined(path, &err.to_string()),
        };
    }

    let migrated = match migrate_v1(&raw) {
        Ok(migrated) => migrated,
        Err(err) => return quarantined(path, &err),
    };

    let mut all_stored = true;
    for (id, key) in &migrated.keys {
        // A key already in the store was saved by this version and is newer than the file's.
        if secrets.get(*id).is_some() {
            continue;
        }
        if secrets.set(*id, key).is_err() || secrets.get(*id).as_deref() != Some(key.as_str()) {
            all_stored = false;
        }
    }

    if !all_stored {
        for (id, key) in &migrated.keys {
            if secrets.get(*id).is_none() {
                secrets.remember(*id, key);
            }
        }
        let notice = "Your API keys could not be moved to Windows Credential Manager, so they are still in the settings file. GhostCue will try again the next time it starts.";
        return (migrated.config, LoadOutcome::Migrated, Some(notice.to_string()));
    }

    let mut parts = Vec::new();
    if !migrated.keys.is_empty() {
        parts.push("Your API keys were moved from the settings file to Windows Credential Manager.".to_string());
    }
    parts.extend(migrated.notes);
    if let Err(err) = write_atomic(path, &migrated.config) {
        warn!("Migrated settings could not be written: {err}");
        parts.push("The updated settings file could not be written, so this will run again next time.".to_string());
    }
    let notice = if parts.is_empty() { None } else { Some(parts.join(" ")) };
    (migrated.config, LoadOutcome::Migrated, notice)
}

fn quarantined(path: &Path, reason: &str) -> (AppConfig, LoadOutcome, Option<String>) {
    warn!("Settings file is not usable ({reason}); setting it aside.");
    let (backup, notice) = match move_aside(path) {
        Some(backup) => {
            let name = backup.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            (
                backup,
                format!("Your settings file could not be read, so default settings are in use. The old file was kept as {name}. Saved API keys are not affected."),
            )
        }
        None => (
            path.to_path_buf(),
            "Your settings file could not be read and could not be backed up. Default settings are in use, and saving will replace the old file.".to_string(),
        ),
    };
    (AppConfig::default(), LoadOutcome::Quarantined { backup }, Some(notice))
}

fn move_aside(path: &Path) -> Option<PathBuf> {
    let dir = path.parent()?;
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    for n in 0..1000 {
        let name = if n == 0 {
            format!("ghostcue_config.bad-{secs}.json")
        } else {
            format!("ghostcue_config.bad-{secs}-{n}.json")
        };
        let target = dir.join(name);
        if target.exists() {
            continue;
        }
        if fs::rename(path, &target).is_ok() {
            return Some(target);
        }
        return fs::copy(path, &target).ok().map(|_| target);
    }
    None
}

fn write_atomic(path: &Path, config: &AppConfig) -> Result<(), String> {
    let failed = |err: std::io::Error| format!("Settings could not be saved: {err}");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(failed)?;
    }
    let json = serde_json::to_string_pretty(config).map_err(|e| format!("Settings could not be saved: {e}"))?;
    let tmp = path.with_file_name(format!("{CONFIG_FILE}.tmp"));
    let written = fs::write(&tmp, json).and_then(|_| fs::rename(&tmp, path));
    if let Err(err) = written {
        let _ = fs::remove_file(&tmp);
        return Err(failed(err));
    }
    Ok(())
}

/// Development convenience: keys from a `.env` file are held in memory for this run only,
/// and only where no key is saved. Settings are filled only where they are empty.
pub fn apply_dev_env(text: &str, config: &mut AppConfig, secrets: &dyn SecretStore) {
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((name, value)) = line.split_once('=') else { continue };
        let name = name.trim();
        let value = value.trim().trim_matches('"').trim_matches('\'').trim();
        if value.is_empty() {
            continue;
        }
        let key_id = match name {
            "OPENROUTER_API_KEY" => Some(KeyId::OpenRouter),
            "GEMINI_API_KEY" => Some(KeyId::Gemini),
            "OPENAI_API_KEY" => Some(KeyId::OpenAi),
            "ANTHROPIC_API_KEY" => Some(KeyId::Anthropic),
            "DEEPSEEK_API_KEY" => Some(KeyId::DeepSeek),
            "GROQ_API_KEY" => Some(KeyId::Groq),
            "CUSTOM_API_KEY" => Some(KeyId::Custom),
            "DEEPGRAM_API_KEY" => Some(KeyId::Deepgram),
            _ => None,
        };
        if let Some(id) = key_id {
            if secrets.get(id).is_none() {
                secrets.remember(id, value);
            }
            continue;
        }
        let field = match name {
            "GEMINI_MODEL" => &mut config.gemini_model,
            "OPENAI_MODEL" => &mut config.openai_model,
            "OPENAI_BASE_URL" => &mut config.openai_base_url,
            "ANTHROPIC_MODEL" => &mut config.anthropic_model,
            "DEEPSEEK_MODEL" => &mut config.deepseek_model,
            "GROQ_MODEL" => &mut config.groq_model,
            "OLLAMA_ENDPOINT" => &mut config.ollama_endpoint,
            "OLLAMA_MODEL" => &mut config.ollama_model,
            "OPENROUTER_MODEL" => &mut config.openrouter_model,
            "CUSTOM_ENDPOINT" => &mut config.custom_endpoint,
            "CUSTOM_MODEL" => &mut config.custom_model,
            _ => continue,
        };
        if field.is_empty() {
            *field = value.to_string();
        }
    }
}

#[tauri::command]
pub async fn get_app_config(state: State<'_, AppState>) -> Result<AppConfig, String> {
    Ok(state.inner().config_manager.get_config())
}

#[tauri::command]
pub async fn save_app_config(new_config: AppConfig, state: State<'_, AppState>) -> Result<AppConfig, String> {
    state.inner().config_manager.update_config(new_config)?;
    let saved = state.inner().config_manager.get_config();
    {
        let capture_mgr = state.inner().audio_capture.lock();
        capture_mgr.update_params(saved.vad_sensitivity, saved.vad_silence_cutoff_ms);
    }
    Ok(saved)
}

/// A one-time message about what happened to the settings file at startup, if anything did.
#[tauri::command]
pub async fn get_config_notice(state: State<'_, AppState>) -> Result<Option<String>, String> {
    Ok(state.inner().config_manager.take_notice())
}

#[cfg(test)]
#[path = "config_tests.rs"]
mod tests;
