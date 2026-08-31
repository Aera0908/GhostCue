use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use parking_lot::RwLock;
use log::{info, warn};
use tauri::State;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    // Window & Stealth
    pub anti_capture_enabled: bool,
    pub opacity: f64,
    pub click_through: bool,
    pub always_on_top: bool,

    // Audio Devices
    pub audio_input_device: Option<String>,
    pub audio_output_device: Option<String>,
    pub mic_enabled: bool,
    pub loopback_enabled: bool,

    // VAD
    pub vad_sensitivity: f32, // 0.1 to 1.0 (threshold)
    pub vad_speech_threshold_ms: u64, // e.g. 300 ms
    pub vad_silence_cutoff_ms: u64, // e.g. 800 ms

    // STT Engine
    pub stt_provider: String, // "local_whisper" | "deepgram" | "mock"
    pub whisper_model_path: String,
    pub whisper_model_size: String, // "tiny.en", "base.en", "small.en"
    pub deepgram_api_key: String,

    // LLM Provider
    pub llm_provider: String, // "ollama" | "openai" | "anthropic" | "groq" | "custom"
    pub ollama_endpoint: String,
    pub ollama_model: String,
    pub openai_api_key: String,
    pub openai_model: String,
    pub openai_base_url: String,
    pub anthropic_api_key: String,
    pub anthropic_model: String,
    pub custom_endpoint: String,
    pub custom_api_key: String,
    pub custom_model: String,

    // Interview Context & Prompts
    pub target_role: String,
    pub company_name: String,
    pub interview_title: String,
    pub job_description: String,
    pub candidate_resume: String,
    pub system_prompt_override: String,
    pub auto_trigger_enabled: bool,
    pub max_context_turns: usize,
}

impl Default for AppConfig {
    fn default() -> Self {
        let mut config = Self {
            anti_capture_enabled: true,
            opacity: 0.92,
            click_through: false,
            always_on_top: true,

            audio_input_device: None,
            audio_output_device: None,
            mic_enabled: true,
            loopback_enabled: true,

            vad_sensitivity: 0.5,
            vad_speech_threshold_ms: 300,
            vad_silence_cutoff_ms: 800,

            stt_provider: "cloud_whisper".to_string(),
            whisper_model_path: "".to_string(),
            whisper_model_size: "base.en".to_string(),
            deepgram_api_key: "".to_string(),

            llm_provider: "openai".to_string(),
            ollama_endpoint: "http://localhost:11434".to_string(),
            ollama_model: "llama3.2".to_string(),
            openai_api_key: "".to_string(),
            openai_model: "gpt-4o-mini".to_string(),
            openai_base_url: "https://api.openai.com/v1".to_string(),
            anthropic_api_key: "".to_string(),
            anthropic_model: "claude-3-5-sonnet-20241022".to_string(),
            custom_endpoint: "".to_string(),
            custom_api_key: "".to_string(),
            custom_model: "".to_string(),

            target_role: "Senior Software Engineer".to_string(),
            company_name: "".to_string(),
            interview_title: "".to_string(),
            job_description: "Full Stack / Distributed Systems Engineer. Tech: Rust, TypeScript, React, System Design, Algorithms.".to_string(),
            candidate_resume: "Experienced engineer with 6+ years in backend systems, high-concurrency microservices, TypeScript, and modern frontend frameworks.".to_string(),
            system_prompt_override: "".to_string(),
            auto_trigger_enabled: true,
            max_context_turns: 10,
        };

        Self::apply_env_overrides(&mut config);
        config
    }
}

impl AppConfig {
    /// Load .env file and apply any environment variables to config dynamically
    pub fn apply_env_overrides(config: &mut AppConfig) {
        // Try multiple standard locations for .env
        let _ = dotenvy::dotenv();
        let _ = dotenvy::from_filename(".env");
        let _ = dotenvy::from_filename("../.env");

        // Also manually parse .env if present in current dir or parent to catch live edits
        let env_paths = vec![
            PathBuf::from(".env"),
            PathBuf::from("../.env"),
            std::env::current_dir().unwrap_or_default().join(".env"),
        ];

        for path in env_paths {
            if path.exists() {
                if let Ok(content) = fs::read_to_string(&path) {
                    for line in content.lines() {
                        let trimmed = line.trim();
                        if trimmed.is_empty() || trimmed.starts_with('#') {
                            continue;
                        }
                        if let Some((key, val)) = trimmed.split_once('=') {
                            let clean_key = key.trim();
                            let clean_val = val.trim().trim_matches('"').trim_matches('\'').to_string();
                            if !clean_val.is_empty() {
                                env::set_var(clean_key, &clean_val);
                            }
                        }
                    }
                }
            }
        }

        if let Ok(val) = env::var("OPENAI_API_KEY") {
            if !val.trim().is_empty() {
                config.openai_api_key = val.trim().to_string();
                if config.llm_provider.is_empty() || config.llm_provider == "ollama" {
                    config.llm_provider = "openai".to_string();
                }
                if config.stt_provider.is_empty() || config.stt_provider == "local_whisper" {
                    config.stt_provider = "cloud_whisper".to_string();
                }
            }
        }
        if let Ok(val) = env::var("OPENAI_MODEL") {
            if !val.trim().is_empty() {
                config.openai_model = val.trim().to_string();
            }
        }
        if let Ok(val) = env::var("OPENAI_BASE_URL") {
            if !val.trim().is_empty() {
                config.openai_base_url = val.trim().to_string();
            }
        }

        if let Ok(val) = env::var("ANTHROPIC_API_KEY") {
            if !val.trim().is_empty() {
                config.anthropic_api_key = val.trim().to_string();
                config.llm_provider = "anthropic".to_string();
            }
        }
        if let Ok(val) = env::var("ANTHROPIC_MODEL") {
            if !val.trim().is_empty() {
                config.anthropic_model = val.trim().to_string();
            }
        }

        if let Ok(val) = env::var("GROQ_API_KEY") {
            if !val.trim().is_empty() {
                config.openai_api_key = val.trim().to_string();
                config.llm_provider = "groq".to_string();
            }
        }

        if let Ok(val) = env::var("DEEPGRAM_API_KEY") {
            if !val.trim().is_empty() {
                config.deepgram_api_key = val.trim().to_string();
                config.stt_provider = "deepgram".to_string();
            }
        }

        if let Ok(val) = env::var("OLLAMA_ENDPOINT") {
            if !val.trim().is_empty() {
                config.ollama_endpoint = val.trim().to_string();
            }
        }
        if let Ok(val) = env::var("OLLAMA_MODEL") {
            if !val.trim().is_empty() {
                config.ollama_model = val.trim().to_string();
            }
        }

        if let Ok(val) = env::var("LLM_PROVIDER") {
            if !val.trim().is_empty() {
                config.llm_provider = val.trim().to_lowercase();
            }
        }
        if let Ok(val) = env::var("STT_PROVIDER") {
            if !val.trim().is_empty() {
                config.stt_provider = val.trim().to_lowercase();
            }
        }

        if let Ok(val) = env::var("TARGET_ROLE") {
            if !val.trim().is_empty() {
                config.target_role = val.trim().to_string();
            }
        }
        if let Ok(val) = env::var("JOB_DESCRIPTION") {
            if !val.trim().is_empty() {
                config.job_description = val.trim().to_string();
            }
        }
        if let Ok(val) = env::var("CANDIDATE_RESUME") {
            if !val.trim().is_empty() {
                config.candidate_resume = val.trim().to_string();
            }
        }
        if let Ok(val) = env::var("SYSTEM_PROMPT_OVERRIDE") {
            if !val.trim().is_empty() {
                config.system_prompt_override = val.trim().to_string();
            }
        }
    }
}

pub struct ConfigManager {
    config: Arc<RwLock<AppConfig>>,
    config_path: PathBuf,
}

impl ConfigManager {
    pub fn new(app_dir: PathBuf) -> Self {
        let config_path = app_dir.join("ghostcue_config.json");
        let mut initial_config = Self::load_from_disk(&config_path).unwrap_or_default();
        
        AppConfig::apply_env_overrides(&mut initial_config);

        Self {
            config: Arc::new(RwLock::new(initial_config)),
            config_path,
        }
    }

    pub fn get_config(&self) -> AppConfig {
        let mut cfg = self.config.read().clone();
        AppConfig::apply_env_overrides(&mut cfg);
        cfg
    }

    pub fn update_config(&self, new_config: AppConfig) -> Result<(), String> {
        {
            let mut write_guard = self.config.write();
            *write_guard = new_config.clone();
        }
        self.save_to_disk(&new_config)
    }

    fn load_from_disk(path: &PathBuf) -> Option<AppConfig> {
        if !path.exists() {
            return None;
        }
        match fs::read_to_string(path) {
            Ok(content) => match serde_json::from_str::<AppConfig>(&content) {
                Ok(mut cfg) => {
                    info!("Loaded GhostCue configuration from {:?}", path);
                    AppConfig::apply_env_overrides(&mut cfg);
                    Some(cfg)
                }
                Err(err) => {
                    warn!("Failed to parse config file {:?}: {}. Using default.", path, err);
                    None
                }
            },
            Err(err) => {
                warn!("Failed to read config file {:?}: {}. Using default.", path, err);
                None
            }
        }
    }

    fn save_to_disk(&self, config: &AppConfig) -> Result<(), String> {
        if let Some(parent) = self.config_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let json_str = serde_json::to_string_pretty(config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
        fs::write(&self.config_path, json_str)
            .map_err(|e| format!("Failed to write config file to {:?}: {}", self.config_path, e))?;
        info!("Saved GhostCue configuration to {:?}", self.config_path);
        Ok(())
    }
}

#[tauri::command]
pub async fn get_app_config(state: State<'_, AppState>) -> Result<AppConfig, String> {
    Ok(state.inner().config_manager.get_config())
}

#[tauri::command]
pub async fn save_app_config(
    new_config: AppConfig,
    state: State<'_, AppState>,
) -> Result<AppConfig, String> {
    state.inner().config_manager.update_config(new_config.clone())?;
    Ok(new_config)
}
