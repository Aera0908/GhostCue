use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use parking_lot::RwLock;
use log::{info, warn};
use tauri::State;
use crate::state::AppState;

fn default_ui_language() -> String {
    "en".to_string()
}

fn default_auto_language() -> String {
    "auto".to_string()
}

fn default_true() -> bool {
    true
}

fn default_auto_trigger_delay() -> u64 {
    1500
}

fn default_false() -> bool {
    false
}

fn default_live_ocr_interval() -> u64 {
    10
}

fn default_deepseek_model() -> String {
    "deepseek-chat".to_string()
}

fn default_font_size() -> u32 {
    14
}

fn default_openrouter_model() -> String {
    "deepseek/deepseek-chat".to_string()
}

fn default_groq_whisper_model() -> String {
    "whisper-large-v3-turbo".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    // Window & Stealth
    pub anti_capture_enabled: bool,
    #[serde(default = "default_true")]
    pub focus_shield_enabled: bool,
    pub opacity: f64,
    pub click_through: bool,
    pub always_on_top: bool,
    #[serde(default = "default_font_size")]
    pub font_size: u32,

    // Audio Devices
    pub audio_input_device: Option<String>,
    pub audio_output_device: Option<String>,
    pub mic_enabled: bool,
    pub loopback_enabled: bool,

    // VAD
    pub vad_sensitivity: f32, // 0.1 to 1.0 (threshold)
    pub vad_speech_threshold_ms: u64, // e.g. 300 ms
    pub vad_silence_cutoff_ms: u64, // e.g. 800 ms

    // Language & Localization
    #[serde(default = "default_ui_language")]
    pub ui_language: String, // "en", "zh-CN", "zh-TW", "es", "ja", "de", "fr", "pt-BR", "ko", "ru", "tl-PH"
    #[serde(default = "default_auto_language")]
    pub stt_language: String, // "auto", "en", "tl", "zh", "es", "ja", "de", "fr", "pt", "ko", "ru", "hi", "ar"
    #[serde(default)]
    pub stt_languages: Vec<String>, // e.g. ["en", "tl"] for restricted multi-language detection
    #[serde(default = "default_auto_language")]
    pub response_language: String, // "auto", "en", "tl-PH", "zh-CN", "zh-TW", "es", "ja", "de", "fr", "pt-BR", "ko", "ru", "hi", "ar"

    // STT Engine
    pub stt_provider: String, // "cloud_whisper" | "local_whisper" | "deepgram" | "groq" | "openrouter" | "mock"
    pub whisper_model_path: String,
    pub whisper_model_size: String, // "tiny.en", "base.en", "small.en"
    pub deepgram_api_key: String,
    #[serde(default)]
    pub groq_api_key: String,
    #[serde(default = "default_groq_whisper_model")]
    pub groq_whisper_model: String,

    // LLM Provider
    pub llm_provider: String, // "gemini" | "ollama" | "openai" | "anthropic" | "groq" | "custom"
    pub gemini_api_key: String,
    pub gemini_model: String,
    pub ollama_endpoint: String,
    pub ollama_model: String,
    pub openai_api_key: String,
    pub openai_model: String,
    pub openai_base_url: String,
    pub anthropic_api_key: String,
    pub anthropic_model: String,
    #[serde(default)]
    pub deepseek_api_key: String,
    #[serde(default = "default_deepseek_model")]
    pub deepseek_model: String,
    pub custom_endpoint: String,
    pub custom_api_key: String,
    pub custom_model: String,
    #[serde(default)]
    pub openrouter_api_key: String,
    #[serde(default = "default_openrouter_model")]
    pub openrouter_model: String,

    // Interview Context & Prompts
    pub target_role: String,
    pub company_name: String,
    pub interview_title: String,
    pub job_description: String,
    pub candidate_resume: String,
    pub project_directory: String,
    #[serde(default)]
    pub project_directories: Vec<String>,
    pub project_context: String,
    pub system_prompt_override: String,
    pub auto_trigger_enabled: bool,
    #[serde(default = "default_auto_trigger_delay")]
    pub auto_trigger_delay_ms: u64,
    #[serde(default = "default_false")]
    pub live_ocr_enabled: bool,
    #[serde(default = "default_live_ocr_interval")]
    pub live_ocr_interval_secs: u64,
    #[serde(default = "default_true")]
    pub live_ocr_smart_diff: bool,
    pub max_context_turns: usize,
    #[serde(default = "default_true")]
    pub smart_model_routing: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        let mut config = Self {
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
            whisper_model_path: "".to_string(),
            whisper_model_size: "base.en".to_string(),
            deepgram_api_key: "".to_string(),
            groq_api_key: "".to_string(),
            groq_whisper_model: "whisper-large-v3-turbo".to_string(),

            llm_provider: "gemini".to_string(),
            gemini_api_key: "".to_string(),
            gemini_model: "gemini-2.5-flash".to_string(),
            ollama_endpoint: "http://localhost:11434".to_string(),
            ollama_model: "qwen2.5-coder:7b".to_string(),
            openai_api_key: "".to_string(),
            openai_model: "gpt-4o".to_string(),
            openai_base_url: "https://api.openai.com/v1".to_string(),
            anthropic_api_key: "".to_string(),
            anthropic_model: "claude-3-5-sonnet-20241022".to_string(),
            deepseek_api_key: "".to_string(),
            deepseek_model: "deepseek-chat".to_string(),
            custom_endpoint: "".to_string(),
            custom_api_key: "".to_string(),
            custom_model: "".to_string(),
            openrouter_api_key: "".to_string(),
            openrouter_model: "deepseek/deepseek-chat".to_string(),

            target_role: "Senior Software Engineer".to_string(),
            company_name: "".to_string(),
            interview_title: "".to_string(),
            job_description: "Full Stack / Distributed Systems Engineer. Tech: Rust, TypeScript, React, System Design, Algorithms.".to_string(),
            candidate_resume: "Experienced engineer with 6+ years in backend systems, high-concurrency microservices, TypeScript, and modern frontend frameworks.".to_string(),
            project_directory: "".to_string(),
            project_directories: Vec::new(),
            project_context: "".to_string(),
            system_prompt_override: "".to_string(),
            auto_trigger_enabled: true,
            auto_trigger_delay_ms: 1500,
            live_ocr_enabled: false,
            live_ocr_interval_secs: 10,
            live_ocr_smart_diff: true,
            max_context_turns: 10,
            smart_model_routing: true,
        };

        Self::apply_env_overrides(&mut config);
        config
    }
}

impl AppConfig {
    /// Apply environment variables from .env as fallbacks for any missing/empty settings,
    /// without overwriting user-configured values.
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

        // Only populate API keys and endpoints if currently empty in config
        if config.gemini_api_key.is_empty() {
            if let Ok(val) = env::var("GEMINI_API_KEY") {
                if !val.trim().is_empty() {
                    config.gemini_api_key = val.trim().to_string();
                }
            }
        }
        if config.gemini_model.is_empty() {
            if let Ok(val) = env::var("GEMINI_MODEL") {
                if !val.trim().is_empty() {
                    config.gemini_model = val.trim().to_string();
                }
            }
        }

        if config.openai_api_key.is_empty() {
            if let Ok(val) = env::var("OPENAI_API_KEY") {
                if !val.trim().is_empty() {
                    config.openai_api_key = val.trim().to_string();
                }
            }
        }
        if config.openai_model.is_empty() {
            if let Ok(val) = env::var("OPENAI_MODEL") {
                if !val.trim().is_empty() {
                    config.openai_model = val.trim().to_string();
                }
            }
        }
        if config.openai_base_url.is_empty() {
            if let Ok(val) = env::var("OPENAI_BASE_URL") {
                if !val.trim().is_empty() {
                    config.openai_base_url = val.trim().to_string();
                }
            }
        }

        if config.anthropic_api_key.is_empty() {
            if let Ok(val) = env::var("ANTHROPIC_API_KEY") {
                if !val.trim().is_empty() {
                    config.anthropic_api_key = val.trim().to_string();
                }
            }
        }
        if config.anthropic_model.is_empty() {
            if let Ok(val) = env::var("ANTHROPIC_MODEL") {
                if !val.trim().is_empty() {
                    config.anthropic_model = val.trim().to_string();
                }
            }
        }

        if config.deepseek_api_key.is_empty() {
            if let Ok(val) = env::var("DEEPSEEK_API_KEY") {
                if !val.trim().is_empty() {
                    config.deepseek_api_key = val.trim().to_string();
                }
            }
        }
        if config.deepseek_model.is_empty() {
            if let Ok(val) = env::var("DEEPSEEK_MODEL") {
                if !val.trim().is_empty() {
                    config.deepseek_model = val.trim().to_string();
                }
            }
        }

        if config.deepgram_api_key.is_empty() {
            if let Ok(val) = env::var("DEEPGRAM_API_KEY") {
                if !val.trim().is_empty() {
                    config.deepgram_api_key = val.trim().to_string();
                }
            }
        }

        if config.ollama_endpoint.is_empty() {
            if let Ok(val) = env::var("OLLAMA_ENDPOINT") {
                if !val.trim().is_empty() {
                    config.ollama_endpoint = val.trim().to_string();
                }
            }
        }
        if config.ollama_model.is_empty() {
            if let Ok(val) = env::var("OLLAMA_MODEL") {
                if !val.trim().is_empty() {
                    config.ollama_model = val.trim().to_string();
                }
            }
        }

        if config.openrouter_api_key.is_empty() {
            if let Ok(val) = env::var("OPENROUTER_API_KEY") {
                if !val.trim().is_empty() {
                    config.openrouter_api_key = val.trim().to_string();
                }
            }
        }
        if config.openrouter_model.is_empty() {
            if let Ok(val) = env::var("OPENROUTER_MODEL") {
                if !val.trim().is_empty() {
                    config.openrouter_model = val.trim().to_string();
                }
            }
        }

        if config.custom_api_key.is_empty() {
            if let Ok(val) = env::var("CUSTOM_API_KEY") {
                if !val.trim().is_empty() {
                    config.custom_api_key = val.trim().to_string();
                }
            }
        }
        if config.custom_endpoint.is_empty() {
            if let Ok(val) = env::var("CUSTOM_ENDPOINT") {
                if !val.trim().is_empty() {
                    config.custom_endpoint = val.trim().to_string();
                }
            }
        }
        if config.custom_model.is_empty() {
            if let Ok(val) = env::var("CUSTOM_MODEL") {
                if !val.trim().is_empty() {
                    config.custom_model = val.trim().to_string();
                }
            }
        }

        // Bridge openrouter_api_key and custom_api_key
        if config.openrouter_api_key.is_empty() && !config.custom_api_key.is_empty() {
            config.openrouter_api_key = config.custom_api_key.clone();
        } else if !config.openrouter_api_key.is_empty() && config.custom_api_key.is_empty() {
            config.custom_api_key = config.openrouter_api_key.clone();
            if config.custom_endpoint.is_empty() {
                config.custom_endpoint = "https://openrouter.ai/api/v1".to_string();
            }
        }

        // Only choose initial LLM provider if config does not already have a valid provider selected
        if config.llm_provider.is_empty() {
            if let Ok(val) = env::var("LLM_PROVIDER") {
                let trimmed = val.trim().to_lowercase();
                if !trimmed.is_empty() {
                    config.llm_provider = trimmed;
                }
            } else if !config.openrouter_api_key.is_empty() {
                config.llm_provider = "openrouter".to_string();
            } else if !config.custom_api_key.is_empty() {
                config.llm_provider = "custom".to_string();
            } else if !config.gemini_api_key.is_empty() {
                config.llm_provider = "gemini".to_string();
            } else if !config.openai_api_key.is_empty() {
                config.llm_provider = "openai".to_string();
            } else if !config.anthropic_api_key.is_empty() {
                config.llm_provider = "anthropic".to_string();
            } else {
                config.llm_provider = "openrouter".to_string();
            }
        }

        // Only choose initial STT provider if config does not already have one
        if config.stt_provider.is_empty() {
            if let Ok(val) = env::var("STT_PROVIDER") {
                let trimmed = val.trim().to_lowercase();
                if !trimmed.is_empty() {
                    config.stt_provider = trimmed;
                }
            }
        }

        if config.auto_trigger_delay_ms == 0 {
            if let Ok(val) = env::var("AUTO_TRIGGER_DELAY_MS") {
                if let Ok(parsed) = val.trim().parse::<u64>() {
                    config.auto_trigger_delay_ms = parsed;
                }
            }
            if config.auto_trigger_delay_ms == 0 {
                config.auto_trigger_delay_ms = 1500;
            }
        }

        if config.live_ocr_interval_secs == 0 {
            if let Ok(val) = env::var("LIVE_OCR_INTERVAL_SECS") {
                if let Ok(parsed) = val.trim().parse::<u64>() {
                    config.live_ocr_interval_secs = parsed;
                }
            }
            if config.live_ocr_interval_secs == 0 {
                config.live_ocr_interval_secs = 10;
            }
        }

        if config.target_role.is_empty() {
            if let Ok(val) = env::var("TARGET_ROLE") {
                if !val.trim().is_empty() {
                    config.target_role = val.trim().to_string();
                }
            }
        }
        if config.job_description.is_empty() {
            if let Ok(val) = env::var("JOB_DESCRIPTION") {
                if !val.trim().is_empty() {
                    config.job_description = val.trim().to_string();
                }
            }
        }
        if config.candidate_resume.is_empty() {
            if let Ok(val) = env::var("CANDIDATE_RESUME") {
                if !val.trim().is_empty() {
                    config.candidate_resume = val.trim().to_string();
                }
            }
        }
        if config.system_prompt_override.is_empty() {
            if let Ok(val) = env::var("SYSTEM_PROMPT_OVERRIDE") {
                if !val.trim().is_empty() {
                    config.system_prompt_override = val.trim().to_string();
                }
            }
        }
        if config.ui_language.is_empty() {
            if let Ok(val) = env::var("UI_LANGUAGE") {
                if !val.trim().is_empty() {
                    config.ui_language = val.trim().to_string();
                }
            }
        }
        if config.stt_language.is_empty() {
            if let Ok(val) = env::var("STT_LANGUAGE") {
                if !val.trim().is_empty() {
                    config.stt_language = val.trim().to_string();
                }
            }
        }
        if config.response_language.is_empty() {
            if let Ok(val) = env::var("RESPONSE_LANGUAGE") {
                if !val.trim().is_empty() {
                    config.response_language = val.trim().to_string();
                }
            }
        }
        if let Ok(val) = env::var("SMART_MODEL_ROUTING") {
            config.smart_model_routing = val.trim().eq_ignore_ascii_case("true") || val.trim() == "1";
        }
    }

    /// Returns the active model name, optionally routing based on task type.
    pub fn get_effective_model(&self, action_name: &str) -> String {
        let is_complex_task = action_name == "code" || action_name == "vision" || action_name == "screen";

        if !self.smart_model_routing {
            return match self.llm_provider.as_str() {
                "gemini" => if self.gemini_model.is_empty() { "gemini-2.5-flash".to_string() } else { self.gemini_model.clone() },
                "ollama" => if self.ollama_model.is_empty() { "qwen2.5-coder:7b".to_string() } else { self.ollama_model.clone() },
                "openai" => if self.openai_model.is_empty() { "gpt-4o".to_string() } else { self.openai_model.clone() },
                "anthropic" => if self.anthropic_model.is_empty() { "claude-3-5-sonnet-20241022".to_string() } else { self.anthropic_model.clone() },
                "groq" => if self.openai_model.is_empty() { "llama-3.3-70b-versatile".to_string() } else { self.openai_model.clone() },
                "deepseek" => if self.deepseek_model.is_empty() { "deepseek-chat".to_string() } else { self.deepseek_model.clone() },
                "openrouter" => if !self.openrouter_model.is_empty() { self.openrouter_model.clone() } else if !self.custom_model.is_empty() { self.custom_model.clone() } else { "deepseek/deepseek-chat".to_string() },
                _ => self.custom_model.clone(),
            };
        }

        match self.llm_provider.as_str() {
            "openai" => {
                if is_complex_task {
                    if self.openai_model.is_empty() || self.openai_model == "gpt-4o-mini" || self.openai_model == "gpt-3.5-turbo" {
                        "gpt-4o".to_string()
                    } else {
                        self.openai_model.clone()
                    }
                } else {
                    if self.openai_model.is_empty() {
                        "gpt-4o-mini".to_string()
                    } else {
                        self.openai_model.clone()
                    }
                }
            }
            "anthropic" => {
                if is_complex_task {
                    if self.anthropic_model.is_empty() || self.anthropic_model.contains("haiku") {
                        "claude-3-5-sonnet-20241022".to_string()
                    } else {
                        self.anthropic_model.clone()
                    }
                } else {
                    if self.anthropic_model.is_empty() {
                        "claude-3-5-haiku-20241022".to_string()
                    } else {
                        self.anthropic_model.clone()
                    }
                }
            }
            "gemini" => {
                if is_complex_task {
                    if self.gemini_model.is_empty() || self.gemini_model == "gemini-1.5-flash" {
                        "gemini-2.5-pro".to_string()
                    } else {
                        self.gemini_model.clone()
                    }
                } else {
                    if self.gemini_model.is_empty() {
                        "gemini-2.5-flash".to_string()
                    } else {
                        self.gemini_model.clone()
                    }
                }
            }
            "groq" => {
                if is_complex_task {
                    "llama-3.3-70b-versatile".to_string()
                } else {
                    "llama-3.1-8b-instant".to_string()
                }
            }
            "deepseek" => {
                if is_complex_task {
                    "deepseek-reasoner".to_string()
                } else {
                    "deepseek-chat".to_string()
                }
            }
            "openrouter" => {
                let chosen = if !self.openrouter_model.is_empty() {
                    &self.openrouter_model
                } else if !self.custom_model.is_empty() {
                    &self.custom_model
                } else {
                    "deepseek/deepseek-chat"
                };

                if is_complex_task {
                    if chosen == "deepseek/deepseek-chat" || chosen == "deepseek-chat" {
                        "deepseek/deepseek-r1".to_string()
                    } else {
                        chosen.to_string()
                    }
                } else {
                    chosen.to_string()
                }
            }
            "ollama" => {
                if is_complex_task {
                    if self.ollama_model.is_empty() || self.ollama_model.contains("llama3.2") {
                        "qwen2.5-coder:7b".to_string()
                    } else {
                        self.ollama_model.clone()
                    }
                } else {
                    if self.ollama_model.is_empty() {
                        "llama3.1:8b".to_string()
                    } else {
                        self.ollama_model.clone()
                    }
                }
            }
            _ => self.custom_model.clone(),
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
        let initial_config = Self::load_from_disk(&config_path).unwrap_or_else(|| {
            let mut cfg = AppConfig::default();
            AppConfig::apply_env_overrides(&mut cfg);
            cfg
        });

        // Ensure runtime environment matches active config
        std::env::set_var("LLM_PROVIDER", &initial_config.llm_provider);

        Self {
            config: Arc::new(RwLock::new(initial_config)),
            config_path,
        }
    }

    pub fn get_config(&self) -> AppConfig {
        self.config.read().clone()
    }

    pub fn update_config(&self, new_config: AppConfig) -> Result<(), String> {
        info!("Updating GhostCue config: provider='{}', model='{}', delay={}ms",
            new_config.llm_provider,
            new_config.get_effective_model("hint"),
            new_config.auto_trigger_delay_ms
        );
        {
            let mut write_guard = self.config.write();
            *write_guard = new_config.clone();
        }
        self.save_to_disk(&new_config)?;
        std::env::set_var("LLM_PROVIDER", &new_config.llm_provider);
        Self::sync_to_dotenv(&new_config);
        Ok(())
    }

    fn sync_to_dotenv(config: &AppConfig) {
        let env_paths = vec![
            PathBuf::from(".env"),
            PathBuf::from("../.env"),
            std::env::current_dir().unwrap_or_default().join(".env"),
        ];

        for path in env_paths {
            if path.exists() {
                if let Ok(content) = fs::read_to_string(&path) {
                    let mut updated = false;
                    let new_lines: Vec<String> = content
                        .lines()
                        .map(|line| {
                            let trimmed = line.trim();
                            if trimmed.starts_with("LLM_PROVIDER=") || trimmed.starts_with("LLM_PROVIDER =") {
                                updated = true;
                                format!("LLM_PROVIDER={}", config.llm_provider)
                            } else {
                                line.to_string()
                            }
                        })
                        .collect();

                    if updated {
                        let mut final_content = new_lines.join("\r\n");
                        if !final_content.ends_with("\r\n") {
                            final_content.push_str("\r\n");
                        }
                        let _ = fs::write(&path, final_content);
                        info!("Synced LLM_PROVIDER='{}' to {:?}", config.llm_provider, path);
                    }
                }
            }
        }
    }

    fn load_from_disk(path: &PathBuf) -> Option<AppConfig> {
        if !path.exists() {
            return None;
        }
        match fs::read_to_string(path) {
            Ok(content) => match serde_json::from_str::<AppConfig>(&content) {
                Ok(mut cfg) => {
                    info!("Loaded GhostCue configuration from {:?}, active provider: '{}'", path, cfg.llm_provider);
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
    {
        let capture_mgr = state.inner().audio_capture.lock();
        capture_mgr.update_params(new_config.vad_sensitivity, new_config.vad_silence_cutoff_ms);
    }
    Ok(new_config)
}
