export interface AppConfig {
  // Window & Stealth
  anti_capture_enabled: boolean;
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

  // STT Engine
  stt_provider: "local_whisper" | "deepgram" | "mock";
  whisper_model_path: string;
  whisper_model_size: string;
  deepgram_api_key: string;

  // LLM Provider
  llm_provider: "ollama" | "openai" | "anthropic" | "groq" | "custom";
  ollama_endpoint: string;
  ollama_model: string;
  openai_api_key: string;
  openai_model: string;
  openai_base_url: string;
  anthropic_api_key: string;
  anthropic_model: string;
  custom_endpoint: string;
  custom_api_key: string;
  custom_model: string;

  // Interview Context & Prompts
  target_role: string;
  job_description: string;
  candidate_resume: string;
  system_prompt_override: string;
  auto_trigger_enabled: boolean;
  max_context_turns: number;
}
