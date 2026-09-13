export interface AppConfig {
  // Window & Stealth
  anti_capture_enabled: boolean;
  focus_shield_enabled?: boolean;
  opacity: number;
  click_through: boolean;
  always_on_top: boolean;

  // Audio Devices
  audio_input_device: string | null;
  audio_output_device: string | null;
  mic_enabled: boolean;
  loopback_enabled: boolean;

  // VAD
  vad_sensitivity: number;
  vad_speech_threshold_ms: number;
  vad_silence_cutoff_ms: number;

  // Language & Localization
  ui_language?: string; // "en" | "zh-CN" | "zh-TW" | "es" | "ja" | "de" | "fr" | "pt-BR" | "ko" | "ru" | "tl-PH"
  stt_language?: string; // "auto" | "en" | "tl" | "zh" | "es" | "ja" | "de" | "fr" | "pt" | "ko" | "ru" | "hi" | "ar"
  stt_languages?: string[]; // e.g. ["en", "tl"] for restricted multi-language detection
  response_language?: string; // "auto" | "en" | "tl-PH" | "zh-CN" | "zh-TW" | "es" | "ja" | "de" | "fr" | "pt-BR" | "ko" | "ru" | "hi" | "ar"

  // STT Engine
  stt_provider: "cloud_whisper" | "local_whisper" | "deepgram" | "mock" | string;
  whisper_model_path: string;
  whisper_model_size: string;
  deepgram_api_key: string;

  // LLM Provider
  llm_provider: "gemini" | "ollama" | "openai" | "anthropic" | "groq" | "deepseek" | "custom" | string;
  gemini_api_key: string;
  gemini_model: string;
  ollama_endpoint: string;
  ollama_model: string;
  openai_api_key: string;
  openai_model: string;
  openai_base_url: string;
  anthropic_api_key: string;
  anthropic_model: string;
  deepseek_api_key?: string;
  deepseek_model?: string;
  custom_endpoint: string;
  custom_api_key: string;
  custom_model: string;

  // Interview Context & Prompts
  target_role: string;
  company_name?: string;
  interview_title?: string;
  job_description: string;
  candidate_resume: string;
  project_directory?: string;
  project_directories?: string[];
  project_context?: string;
  system_prompt_override: string;
  auto_trigger_enabled: boolean;
  auto_trigger_delay_ms?: number;
  live_ocr_enabled?: boolean;
  live_ocr_interval_secs?: number;
  live_ocr_smart_diff?: boolean;
  max_context_turns: number;
  smart_model_routing?: boolean;
}
