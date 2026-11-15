import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { AppConfig } from "../types/config";
import { AudioDevicesResponse, AudioLevelEvent } from "../types/audio";
import { TranscriptSegment } from "../types/transcript";
import { LlmCompleteEvent, LlmErrorEvent, LlmNoticeEvent, LlmStartEvent, LlmTokenEvent } from "../types/llm";

// Check if running inside native Tauri runtime
export const isTauri = (): boolean => {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
};

// Defaults, identical to the backend (checked against src-tauri/tests/fixtures/default_config.json).
export const DEFAULT_CONFIG: AppConfig = {
  config_version: 2,
  anti_capture_enabled: true,
  focus_shield_enabled: true,
  opacity: 0.92,
  click_through: false,
  always_on_top: true,
  font_size: 14,
  audio_input_device: null,
  audio_output_device: null,
  mic_enabled: true,
  loopback_enabled: true,
  vad_sensitivity: 0.5,
  vad_speech_threshold_ms: 300,
  vad_silence_cutoff_ms: 1600,
  ui_language: "en",
  stt_language: "auto",
  stt_languages: ["en", "tl"],
  response_language: "auto",
  stt_provider: "local_whisper",
  whisper_model_path: "",
  whisper_model_size: "base.en",
  groq_whisper_model: "whisper-large-v3-turbo",
  llm_provider: "gemini",
  gemini_model: "gemini-2.5-flash",
  ollama_endpoint: "http://localhost:11434",
  ollama_model: "",
  openai_model: "gpt-4o",
  openai_base_url: "https://api.openai.com/v1",
  anthropic_model: "claude-opus-5-5",
  deepseek_model: "deepseek-chat",
  groq_model: "llama-3.3-70b-versatile",
  custom_endpoint: "",
  custom_model: "",
  openrouter_model: "deepseek/deepseek-chat",
  code_models: {},
  smart_model_routing: false,
  target_role: "Senior Software Engineer",
  company_name: "",
  interview_title: "",
  job_description: "Full Stack / Distributed Systems Engineer. Tech: Rust, TypeScript, React, System Design, Algorithms.",
  candidate_resume:
    "Experienced engineer with 6+ years in backend systems, high-concurrency microservices, TypeScript, and modern frontend frameworks.",
  project_directory: "",
  project_directories: [],
  project_context: "",
  system_prompt_override: "",
  auto_trigger_enabled: true,
  auto_trigger_delay_ms: 1500,
  live_ocr_enabled: false,
  live_ocr_interval_secs: 10,
  live_ocr_smart_diff: true,
  max_context_turns: 10,
};

/** Browser preview only: settings from storage, with defaults filled in and any key field removed. */
function withoutKeys(raw: unknown): AppConfig {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const kept = Object.fromEntries(Object.entries(source).filter(([name]) => !name.endsWith("_api_key")));
  return { ...DEFAULT_CONFIG, ...kept, config_version: 2 } as AppConfig;
}

export type KeyId =
  | "openrouter"
  | "gemini"
  | "openai"
  | "anthropic"
  | "deepseek"
  | "groq"
  | "custom"
  | "deepgram";

export const KEY_IDS: KeyId[] = [
  "openrouter",
  "gemini",
  "openai",
  "anthropic",
  "deepseek",
  "groq",
  "custom",
  "deepgram",
];

export interface ProviderTestResult {
  ok: boolean;
  kind: string | null;
  message: string;
  model: string;
  latency_ms: number;
}

export interface ModelInfo {
  id: string;
  vision: boolean | null;
}

// Browser preview only: keys are held in memory for the page lifetime and never persisted.
const previewKeys = new Map<KeyId, string>();

export const TauriApi = {
  // Provider keys (stored by the backend in Windows Credential Manager; values are never read back)
  async getKeyStatus(): Promise<Record<KeyId, boolean>> {
    if (!isTauri()) {
      return Object.fromEntries(KEY_IDS.map((id) => [id, previewKeys.has(id)])) as Record<KeyId, boolean>;
    }
    const status = await invoke<Partial<Record<KeyId, boolean>>>("get_key_status");
    return Object.fromEntries(KEY_IDS.map((id) => [id, status?.[id] === true])) as Record<KeyId, boolean>;
  },

  async setProviderKey(keyId: KeyId, value: string): Promise<void> {
    if (!value.trim()) {
      throw new Error("Enter a key before saving.");
    }
    if (!isTauri()) {
      previewKeys.set(keyId, value.trim());
      return;
    }
    await invoke("set_provider_key", { keyId, value });
  },

  async clearProviderKey(keyId: KeyId): Promise<void> {
    if (!isTauri()) {
      previewKeys.delete(keyId);
      return;
    }
    await invoke("clear_provider_key", { keyId });
  },

  async testLlmProvider(provider: string): Promise<ProviderTestResult> {
    if (!isTauri()) {
      return { ok: false, kind: "unreachable", message: "Provider tests run in the desktop app only.", model: "", latency_ms: 0 };
    }
    return await invoke<ProviderTestResult>("test_llm_provider", { provider });
  },

  async listProviderModels(provider: string): Promise<ModelInfo[]> {
    if (!isTauri()) return [];
    return await invoke<ModelInfo[]>("list_provider_models", { provider });
  },

  async getConfigNotice(): Promise<string | null> {
    if (!isTauri()) return null;
    return await invoke<string | null>("get_config_notice");
  },

  // Window & Stealth
  async setAntiCapture(enabled: boolean): Promise<boolean> {
    if (!isTauri()) return enabled;
    return await invoke<boolean>("set_anti_capture", { enabled });
  },

  async setFocusShield(enabled: boolean): Promise<boolean> {
    if (!isTauri()) return enabled;
    return await invoke<boolean>("set_focus_shield", { enabled });
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

  async minimizeWindow(): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke("minimize_window");
    } catch (e) {
      console.warn("invoke minimize_window failed, attempting fallback:", e);
      try {
        const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        await getCurrentWebviewWindow().minimize();
      } catch (fallbackErr) {
        console.error("Failed to minimize window:", fallbackErr);
      }
    }
  },

  async unminimizeWindow(): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke("unminimize_window");
    } catch (e) {
      console.warn("invoke unminimize_window failed, attempting fallback:", e);
      try {
        const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        await getCurrentWebviewWindow().unminimize();
      } catch (fallbackErr) {
        console.error("Failed to unminimize window:", fallbackErr);
      }
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
      try {
        return withoutKeys(JSON.parse(localStorage.getItem("ghostcue_config") ?? "null"));
      } catch {
        return withoutKeys(null);
      }
    }
    return await invoke<AppConfig>("get_app_config");
  },

  async saveConfig(config: AppConfig): Promise<AppConfig> {
    if (!isTauri()) {
      const clean = withoutKeys(config);
      localStorage.setItem("ghostcue_config", JSON.stringify(clean));
      return clean;
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

  async updateAudioVadParams(vadSensitivity: number, vadSilenceCutoffMs: number): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke("update_audio_vad_params", {
        vadSensitivity,
        vadSilenceCutoffMs,
      });
    } catch (e) {
      console.warn("updateAudioVadParams error:", e);
    }
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

  async getAvailableWhisperModels(): Promise<
    Array<{ name: string; url: string; size: string; downloaded?: boolean; path?: string }>
  > {
    if (!isTauri()) {
      return [
        { name: "tiny.en", url: "", size: "75 MB" },
        { name: "base.en", url: "", size: "142 MB", downloaded: true, path: "preview/ggml-base.en.bin" },
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

  // Screen Capture & OCR
  async captureScreenForOcr(): Promise<{ base64_image: string; width: number; height: number; format: string; screen_hash?: string; extracted_text?: string }> {
    if (!isTauri()) {
      return { base64_image: "", width: 1920, height: 1080, format: "image/jpeg", screen_hash: "0000000000000000", extracted_text: "" };
    }
    return await invoke<{ base64_image: string; width: number; height: number; format: string; screen_hash?: string; extracted_text?: string }>("capture_screen_for_ocr");
  },

  // Stealth Typer (simulates keyboard input)
  async typeTextStealth(text: string, speedMs?: number): Promise<void> {
    if (!isTauri()) {
      console.log("[Mock Stealth Typer]:", text);
      return;
    }
    await invoke("type_text_stealth", { text, speedMs });
  },

  async cancelStealthTyping(): Promise<void> {
    if (!isTauri()) return;
    await invoke("cancel_stealth_typing");
  },

  // LLM Orchestration
  async generateAiSuggestion(
    action: string = "hint",
    customQuery?: string,
    pastAnswers?: Array<{ action: string; query: string; answer: string }>,
    imageData?: string
  ): Promise<string> {
    if (!isTauri()) {
      return "Mock AI response: Consider breaking down the architecture into high-throughput message streams with idempotent consumer workers.";
    }
    return await invoke<string>("generate_ai_suggestion", {
      action,
      customQuery,
      pastAnswers,
      imageData,
    });
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

  async scanMultipleProjectDirectories(directoryPaths: string[]): Promise<string> {
    if (!isTauri()) {
      return directoryPaths
        .map((p, i) => `### Mock Scanned Project #${i + 1}: ${p}\n- Architecture and codebase context captured.`)
        .join("\n\n");
    }
    return await invoke<string>("scan_multiple_project_directories", { directoryPaths });
  },

  async saveTextFile(defaultFilename: string, content: string): Promise<string | null> {
    if (!isTauri()) {
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = defaultFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return defaultFilename;
    }
    return await invoke<string | null>("save_text_file", {
      defaultFilename,
      content,
    });
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

  onModelDownloadProgress(
    callback: (event: { model: string; progress: number; downloaded: number; total: number }) => void
  ): Promise<UnlistenFn> {
    if (!isTauri()) return Promise.resolve(() => {});
    return listen<{ model: string; progress: number; downloaded: number; total: number }>(
      "model-download-progress",
      (event) => callback(event.payload)
    );
  },

  onLlmNotice(callback: (event: LlmNoticeEvent) => void): Promise<UnlistenFn> {
    if (!isTauri()) return Promise.resolve(() => {});
    return listen<LlmNoticeEvent>("llm-notice", (event) => callback(event.payload));
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
