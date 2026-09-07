import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { AppConfig } from "../types/config";
import { AudioDevicesResponse, AudioLevelEvent } from "../types/audio";
import { TranscriptSegment } from "../types/transcript";
import { LlmCompleteEvent, LlmErrorEvent, LlmStartEvent, LlmTokenEvent } from "../types/llm";

// Check if running inside native Tauri runtime
export const isTauri = (): boolean => {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
};

// Default fallback configuration for standalone / browser preview
export const DEFAULT_CONFIG: AppConfig = {
  anti_capture_enabled: true,
  opacity: 0.92,
  click_through: false,
  always_on_top: true,
  audio_input_device: null,
  audio_output_device: null,
  mic_enabled: true,
  loopback_enabled: true,
  vad_sensitivity: 0.5,
  vad_speech_threshold_ms: 300,
  vad_silence_cutoff_ms: 800,
  ui_language: "en",
  stt_language: "auto",
  response_language: "auto",
  stt_provider: "cloud_whisper",
  whisper_model_path: "",
  whisper_model_size: "base.en",
  deepgram_api_key: "",
  llm_provider: "ollama",
  ollama_endpoint: "http://localhost:11434",
  ollama_model: "llama3.2",
  openai_api_key: "",
  openai_model: "gpt-4o-mini",
  openai_base_url: "https://api.openai.com/v1",
  anthropic_api_key: "",
  anthropic_model: "claude-3-5-sonnet-20241022",
  custom_endpoint: "",
  custom_api_key: "",
  custom_model: "",
  target_role: "Staff Software Engineer",
  job_description: "Distributed systems, Rust, TypeScript, high-throughput pipelines, and system design.",
  candidate_resume: "Principal/Staff software engineer with deep expertise in low-latency backend systems, event-driven architectures, and modern web applications.",
  system_prompt_override: "",
  auto_trigger_enabled: true,
  max_context_turns: 10,
};

export const TauriApi = {
  // Window & Stealth
  async setAntiCapture(enabled: boolean): Promise<boolean> {
    if (!isTauri()) return enabled;
    return await invoke<boolean>("set_anti_capture", { enabled });
  },

  async setClickThrough(enabled: boolean): Promise<boolean> {
    if (!isTauri()) return enabled;
    return await invoke<boolean>("set_click_through", { enabled });
  },

  async toggleHudVisibility(): Promise<boolean> {
    if (!isTauri()) return true;
    return await invoke<boolean>("toggle_hud_visibility");
  },

  async setHudOpacity(opacity: number): Promise<void> {
    if (!isTauri()) return;
    await invoke("set_hud_opacity", { opacity });
  },

  async startDragging(): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke("start_dragging");
    } catch (e) {
      console.warn("startDragging error:", e);
    }
  },

  async exitApp(): Promise<void> {
    if (!isTauri()) {
      window.close();
      return;
    }
    await invoke("exit_app");
  },

  // Config
  async getConfig(): Promise<AppConfig> {
    if (!isTauri()) {
      const saved = localStorage.getItem("ghostcue_config");
      return saved ? JSON.parse(saved) : DEFAULT_CONFIG;
    }
    return await invoke<AppConfig>("get_app_config");
  },

  async saveConfig(config: AppConfig): Promise<AppConfig> {
    if (!isTauri()) {
      localStorage.setItem("ghostcue_config", JSON.stringify(config));
      return config;
    }
    return await invoke<AppConfig>("save_app_config", { newConfig: config });
  },

  // Audio Capture
  async getAudioDevices(): Promise<AudioDevicesResponse> {
    if (!isTauri()) {
      return {
        inputs: [
          { id: "default_mic", name: "Default Microphone (Realtek Audio)", is_default: true, is_input: true, channels: 2, sample_rate: 48000 },
          { id: "usb_mic", name: "USB Studio Microphone", is_default: false, is_input: true, channels: 1, sample_rate: 48000 },
        ],
        outputs: [
          { id: "default_speaker", name: "Default Speakers / Headphones (Loopback)", is_default: true, is_input: false, channels: 2, sample_rate: 48000 },
        ],
      };
    }
    return await invoke<AudioDevicesResponse>("get_audio_devices");
  },

  async startAudioCapture(): Promise<boolean> {
    if (!isTauri()) return true;
    return await invoke<boolean>("start_audio_capture");
  },

  async stopAudioCapture(): Promise<boolean> {
    if (!isTauri()) return false;
    return await invoke<boolean>("stop_audio_capture");
  },

  async getAudioCaptureStatus(): Promise<boolean> {
    if (!isTauri()) return true;
    return await invoke<boolean>("get_audio_capture_status");
  },

  async getAudioLevels(): Promise<{ mic_level: number; mic_active: boolean; loopback_level: number; loopback_active: boolean }> {
    if (!isTauri()) {
      return { mic_level: 0, mic_active: false, loopback_level: 0, loopback_active: false };
    }
    return await invoke<{ mic_level: number; mic_active: boolean; loopback_level: number; loopback_active: boolean }>("get_audio_levels");
  },

  // Transcripts & STT
  async getTranscriptHistory(): Promise<TranscriptSegment[]> {
    if (!isTauri()) return [];
    return await invoke<TranscriptSegment[]>("get_transcript_history");
  },

  async clearTranscriptHistory(): Promise<void> {
    if (!isTauri()) return;
    await invoke("clear_transcript_history");
  },

  async getAvailableWhisperModels(): Promise<Array<{ name: string; url: string; size: string }>> {
    if (!isTauri()) {
      return [
        { name: "tiny.en", url: "", size: "75 MB" },
        { name: "base.en", url: "", size: "142 MB" },
        { name: "small.en", url: "", size: "466 MB" },
        { name: "medium.en", url: "", size: "1.5 GB" },
      ];
    }
    return await invoke("get_available_whisper_models");
  },

  async downloadWhisperModel(modelName: string): Promise<string> {
    if (!isTauri()) return `mock/models/ggml-${modelName}.bin`;
    return await invoke<string>("download_model", { modelName });
  },

  // LLM Orchestration
  async generateAiSuggestion(action: string = "hint", customQuery?: string): Promise<string> {
    if (!isTauri()) {
      return "Mock AI response: Consider breaking down the architecture into high-throughput message streams with idempotent consumer workers.";
    }
    return await invoke<string>("generate_ai_suggestion", { action, customQuery });
  },

  async cancelAiSuggestion(): Promise<void> {
    if (!isTauri()) return;
    await invoke("cancel_ai_suggestion");
  },

  // Project Scanner & Context
  async selectDirectoryDialog(): Promise<string | null> {
    if (!isTauri()) {
      return null;
    }
    return await invoke<string | null>("select_directory_dialog");
  },

  async scanProjectDirectory(directoryPath: string): Promise<string> {
    if (!isTauri()) {
      return `### Mock Scanned Directory Context for: ${directoryPath}\n- Found package.json & README.md\n- Tech: React, TypeScript, Rust, SQLite\n- Architecture: Event-driven micro-HUD with zero-overhead audio streaming.`;
    }
    return await invoke<string>("scan_project_directory", { directoryPath });
  },

  // Event Listeners
  onTranscript(callback: (segment: TranscriptSegment) => void): Promise<UnlistenFn> {
    if (!isTauri()) {
      return Promise.resolve(() => {});
    }
    return listen<TranscriptSegment>("transcript-event", (event) => callback(event.payload));
  },

  onMicLevel(callback: (event: AudioLevelEvent) => void): Promise<UnlistenFn> {
    if (!isTauri()) return Promise.resolve(() => {});
    return listen<AudioLevelEvent>("audio-mic-level", (event) => callback(event.payload));
  },

  onLoopbackLevel(callback: (event: AudioLevelEvent) => void): Promise<UnlistenFn> {
    if (!isTauri()) return Promise.resolve(() => {});
    return listen<AudioLevelEvent>("audio-loopback-level", (event) => callback(event.payload));
  },

  onLlmStart(callback: (event: LlmStartEvent) => void): Promise<UnlistenFn> {
    if (!isTauri()) return Promise.resolve(() => {});
    return listen<LlmStartEvent>("llm-start", (event) => callback(event.payload));
  },

  onLlmToken(callback: (event: LlmTokenEvent) => void): Promise<UnlistenFn> {
    if (!isTauri()) return Promise.resolve(() => {});
    return listen<LlmTokenEvent>("llm-token", (event) => callback(event.payload));
  },

  onLlmComplete(callback: (event: LlmCompleteEvent) => void): Promise<UnlistenFn> {
    if (!isTauri()) return Promise.resolve(() => {});
    return listen<LlmCompleteEvent>("llm-complete", (event) => callback(event.payload));
  },

  onLlmError(callback: (event: LlmErrorEvent) => void): Promise<UnlistenFn> {
    if (!isTauri()) return Promise.resolve(() => {});
    return listen<LlmErrorEvent>("llm-error", (event) => callback(event.payload));
  },
};
