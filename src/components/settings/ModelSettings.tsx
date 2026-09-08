import React, { useEffect, useState } from "react";
import { Cpu, Cloud, Download, CheckCircle, Key, Server, Globe, CheckSquare, Square, Sparkles } from "lucide-react";
import { AppConfig } from "../../types/config";
import { TauriApi } from "../../services/tauriApi";
import { useTranslation } from "../../i18n";

interface ModelSettingsProps {
  config: AppConfig;
  onChange: (key: keyof AppConfig, value: any) => void;
}

interface WhisperModelInfo {
  name: string;
  url: string;
  size: string;
}

const GEMINI_MODELS = [
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", desc: "Recommended • Ultra-fast, highly accurate reasoning" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", desc: "Complex system design & deep algorithmic logic" },
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", desc: "Sub-second low latency inference" },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", desc: "Deep codebase analysis & long context" },
  { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", desc: "Lightweight & responsive" },
];

const OPENAI_MODELS = [
  { id: "gpt-4o-mini", name: "GPT-4o Mini", desc: "Recommended • Ultra-fast, economical & smart" },
  { id: "gpt-4o", name: "GPT-4o", desc: "Flagship multimodal intelligence" },
  { id: "o3-mini", name: "o3-mini", desc: "Fast reasoning & STEM/coding specialist" },
  { id: "o1", name: "o1", desc: "Deep complex reasoning & algorithmic analysis" },
  { id: "gpt-4-turbo", name: "GPT-4 Turbo", desc: "High capability broad knowledge" },
  { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", desc: "Legacy fast model" },
];

const ANTHROPIC_MODELS = [
  { id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet", desc: "Recommended • Latest hybrid reasoning flagship" },
  { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", desc: "Industry-leading software engineering & coding" },
  { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", desc: "Ultra-fast latency & crisp answers" },
  { id: "claude-3-opus-20240229", name: "Claude 3 Opus", desc: "Deep analytical synthesis" },
];

const GROQ_MODELS = [
  { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile", desc: "Recommended • 70B parameters, sub-100ms" },
  { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant", desc: "Ultra-low latency, sub-50ms token generation" },
  { id: "deepseek-r1-distill-llama-70b", name: "DeepSeek R1 Distill 70B", desc: "DeepSeek reasoning on Groq LPU" },
  { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B", desc: "High throughput MoE architecture (32k context)" },
  { id: "gemma2-9b-it", name: "Google Gemma 2 9B", desc: "Compact Google language model" },
];

const OLLAMA_MODELS = [
  { id: "llama3.2", name: "Llama 3.2 (3B)", desc: "Default • Lightweight & fast on local CPU/GPU" },
  { id: "llama3.1", name: "Llama 3.1 (8B)", desc: "Balanced local performance" },
  { id: "deepseek-r1:8b", name: "DeepSeek R1 (8B)", desc: "Local chain-of-thought reasoning" },
  { id: "qwen2.5-coder:7b", name: "Qwen 2.5 Coder (7B)", desc: "Optimized for programming & architecture" },
  { id: "mistral", name: "Mistral (7B)", desc: "General technical Q&A" },
  { id: "phi4", name: "Microsoft Phi-4 (14B)", desc: "High reasoning capacity" },
  { id: "gemma2", name: "Google Gemma 2 (9B)", desc: "Fast Google local model" },
];

const MULTI_LANG_OPTIONS = [
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "tl", label: "Tagalog / Filipino", flag: "🇵🇭" },
  { code: "zh", label: "Chinese / 中文", flag: "🇨🇳" },
  { code: "es", label: "Spanish / Español", flag: "🇪🇸" },
  { code: "ja", label: "Japanese / 日本語", flag: "🇯🇵" },
  { code: "de", label: "German / Deutsch", flag: "🇩🇪" },
  { code: "fr", label: "French / Français", flag: "🇫🇷" },
  { code: "pt", label: "Portuguese / Português", flag: "🇧🇷" },
  { code: "ko", label: "Korean / 한국어", flag: "🇰🇷" },
  { code: "ru", label: "Russian / Русский", flag: "🇷🇺" },
  { code: "hi", label: "Hindi / हिन्दी", flag: "🇮🇳" },
  { code: "ar", label: "Arabic / العربية", flag: "🇸🇦" },
];

export const ModelSettings: React.FC<ModelSettingsProps> = ({ config, onChange }) => {
  const { t } = useTranslation();
  const [whisperModels, setWhisperModels] = useState<WhisperModelInfo[]>([]);
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [customOllamaInput, setCustomOllamaInput] = useState(false);

  useEffect(() => {
    TauriApi.getAvailableWhisperModels().then((models) => {
      setWhisperModels(models as WhisperModelInfo[]);
    });
  }, []);

  const handleDownloadWhisper = async (modelName: string) => {
    setDownloadingModel(modelName);
    setDownloadProgress(0);
    setDownloadSuccess(null);

    try {
      const path = await TauriApi.downloadWhisperModel(modelName);
      onChange("whisper_model_path", path);
      onChange("whisper_model_size", modelName);
      onChange("stt_provider", "local_whisper");
      setDownloadSuccess(`${modelName} downloaded & active!`);
    } catch (err: any) {
      alert(`Failed to download model: ${err}`);
    } finally {
      setDownloadingModel(null);
    }
  };

  const selectedSttLanguages = config.stt_languages || ["en", "tl"];

  const toggleLanguage = (code: string) => {
    let next: string[];
    if (selectedSttLanguages.includes(code)) {
      next = selectedSttLanguages.filter((c) => c !== code);
      if (next.length === 0) next = ["en"]; // Ensure at least one language
    } else {
      next = [...selectedSttLanguages, code];
    }
    onChange("stt_languages", next);
    // If only 1 selected, set as stt_language code; otherwise set primary or auto
    onChange("stt_language", next.length === 1 ? next[0] : "auto");
  };

  return (
    <div className="space-y-4 text-sm font-sans">
      {/* --- STT Engine Section --- */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3 font-sans text-xs">
        <h4 className="flex items-center gap-2 font-bold text-slate-100 uppercase tracking-wider">
          <Cpu className="w-4 h-4 text-sky-400" />
          <span>{t.settings.sttProvider}</span>
        </h4>

        {/* Multi-Language Selection Constraints */}
        <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-sky-400" />
              <label className="font-bold text-slate-100 uppercase text-xs">
                Speech Recognition Languages
              </label>
            </div>
            <span className="text-[11px] text-sky-400 font-medium">
              {selectedSttLanguages.length} Selected ({selectedSttLanguages.join(", ").toUpperCase()})
            </span>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Check the languages spoken in your interview (e.g. <strong>English</strong> + <strong>Tagalog</strong> for Taglish) to prevent misinterpreting words into unintended languages.
          </p>

          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 pt-1">
            {MULTI_LANG_OPTIONS.map((lang) => {
              const isChecked = selectedSttLanguages.includes(lang.code);
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => toggleLanguage(lang.code)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                    isChecked
                      ? "bg-sky-950/70 border-sky-500/60 text-sky-200 shadow-sm"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                  }`}
                >
                  {isChecked ? (
                    <CheckSquare className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  )}
                  <span className="truncate">
                    {lang.flag} {lang.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Engine Switcher */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => onChange("stt_provider", "cloud_whisper")}
            className={`p-3 text-left rounded-xl border transition-all ${
              config.stt_provider === "cloud_whisper" || config.stt_provider === "openai_whisper" || (!config.stt_provider && config.openai_api_key)
                ? "bg-slate-800 border-sky-500/60 text-slate-100 font-bold shadow-sm"
                : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <span className="block font-bold text-emerald-400 text-xs">Cloud Whisper (OpenAI)</span>
            <span className="text-[11px] text-slate-400">Uses API key • Instant</span>
          </button>

          <button
            type="button"
            onClick={() => onChange("stt_provider", "deepgram")}
            className={`p-3 text-left rounded-xl border transition-all ${
              config.stt_provider === "deepgram"
                ? "bg-slate-800 border-sky-500/60 text-slate-100 font-bold shadow-sm"
                : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <span className="block font-bold text-slate-100 text-xs">Deepgram Nova-2</span>
            <span className="text-[11px] text-slate-400">Ultra-fast streaming</span>
          </button>

          <button
            type="button"
            onClick={() => onChange("stt_provider", "local_whisper")}
            className={`p-3 text-left rounded-xl border transition-all ${
              config.stt_provider === "local_whisper"
                ? "bg-slate-800 border-sky-500/60 text-slate-100 font-bold shadow-sm"
                : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <span className="block font-bold text-slate-100 text-xs">Local Whisper GGML</span>
            <span className="text-[11px] text-slate-400">100% Offline download</span>
          </button>
        </div>

        {/* Local Whisper Options */}
        {config.stt_provider === "local_whisper" && (
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
            <label className="block text-slate-200 font-bold text-xs uppercase">
              {t.settings.whisperModel}
            </label>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {whisperModels.map((m) => {
                const isSelected = config.whisper_model_size === m.name;
                const isDownloading = downloadingModel === m.name;

                return (
                  <div
                    key={m.name}
                    className={`flex flex-col p-2.5 rounded-lg border transition-all ${
                      isSelected
                        ? "bg-slate-900 border-sky-500/60 text-slate-100"
                        : "bg-slate-900/60 border-slate-800 text-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-100 uppercase text-xs">{m.name}</span>
                        <span className="text-slate-400 text-xs">({m.size})</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {isSelected && !isDownloading && (
                          <span className="flex items-center gap-1 text-xs text-emerald-400 font-bold">
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>{t.common.active}</span>
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDownloadWhisper(m.name)}
                          disabled={isDownloading}
                          className="flex items-center gap-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-100 disabled:opacity-40 text-xs font-semibold rounded-lg transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>{isDownloading ? t.settings.downloading : t.settings.downloadModel}</span>
                        </button>
                      </div>
                    </div>

                    {isDownloading && (
                      <div className="mt-2 space-y-1">
                        <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-sky-400 transition-all duration-300 rounded-full"
                            style={{ width: `${Math.max(5, downloadProgress)}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-slate-400">
                          Downloading model weights from HuggingFace...
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {downloadSuccess && (
              <p className="text-xs text-emerald-400 mt-1 font-bold">{downloadSuccess}</p>
            )}
          </div>
        )}

        {/* Deepgram Options */}
        {config.stt_provider === "deepgram" && (
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
            <label className="flex items-center gap-2 font-bold text-slate-100 uppercase">
              <Key className="w-4 h-4 text-amber-400" />
              <span>Deepgram API Key</span>
            </label>
            <input
              type="password"
              value={config.deepgram_api_key}
              onChange={(e) => onChange("deepgram_api_key", e.target.value)}
              placeholder="dg_..."
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-400 text-xs font-mono"
            />
          </div>
        )}
      </div>

      {/* --- LLM Provider Section --- */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3 font-sans text-xs">
        <h4 className="flex items-center gap-2 font-bold text-slate-100 uppercase tracking-wider">
          <Cloud className="w-4 h-4 text-purple-400" />
          <span>{t.settings.llmProvider}</span>
        </h4>

        {/* Provider Switcher */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {[
            { id: "gemini", label: "Google Gemini", icon: Sparkles, color: "text-sky-400" },
            { id: "openai", label: "OpenAI GPT", icon: Cloud, color: "text-emerald-400" },
            { id: "anthropic", label: "Claude", icon: Key, color: "text-amber-400" },
            { id: "groq", label: "Groq LPU", icon: Cpu, color: "text-orange-400" },
            { id: "ollama", label: "Ollama Local", icon: Server, color: "text-purple-400" },
          ].map((prov) => {
            const Icon = prov.icon;
            const isSelected = config.llm_provider === prov.id;
            return (
              <button
                key={prov.id}
                type="button"
                onClick={() => onChange("llm_provider", prov.id)}
                className={`py-2 px-2.5 rounded-lg border text-center font-bold text-xs transition-all flex flex-col items-center justify-center gap-1 ${
                  isSelected
                    ? "bg-slate-800 border-sky-500/60 text-white shadow-sm"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                <Icon className={`w-4 h-4 ${prov.color}`} />
                <span className="text-[11px] truncate w-full">{prov.label}</span>
              </button>
            );
          })}
        </div>

        {/* Google Gemini Settings */}
        {config.llm_provider === "gemini" && (
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
            <div>
              <label className="flex items-center gap-2 font-bold text-slate-100 mb-1.5 uppercase">
                <Key className="w-4 h-4 text-sky-400" />
                <span>Google Gemini API Key</span>
              </label>
              <input
                type="password"
                value={config.gemini_api_key || ""}
                onChange={(e) => onChange("gemini_api_key", e.target.value)}
                placeholder="AIzaSy..."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs font-mono focus:outline-none focus:border-sky-400"
              />
              <p className="text-[11px] text-slate-400 mt-1">Get an API key free at aistudio.google.com</p>
            </div>

            <div>
              <label className="block font-bold text-slate-100 mb-1.5 uppercase">
                Gemini Model Selection
              </label>
              <select
                value={config.gemini_model || "gemini-2.5-flash"}
                onChange={(e) => onChange("gemini_model", e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-400 cursor-pointer"
              >
                {GEMINI_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.desc}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* OpenAI Settings */}
        {config.llm_provider === "openai" && (
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
            <div>
              <label className="flex items-center gap-2 font-bold text-slate-100 mb-1.5 uppercase">
                <Key className="w-4 h-4 text-emerald-400" />
                <span>OpenAI API Key</span>
              </label>
              <input
                type="password"
                value={config.openai_api_key}
                onChange={(e) => onChange("openai_api_key", e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs font-mono focus:outline-none focus:border-sky-400"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-100 mb-1.5 uppercase">
                OpenAI Model Selection
              </label>
              <select
                value={config.openai_model || "gpt-4o-mini"}
                onChange={(e) => onChange("openai_model", e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-400 cursor-pointer"
              >
                {OPENAI_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.desc}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Anthropic Settings */}
        {config.llm_provider === "anthropic" && (
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
            <div>
              <label className="flex items-center gap-2 font-bold text-slate-100 mb-1.5 uppercase">
                <Key className="w-4 h-4 text-amber-400" />
                <span>Anthropic Claude API Key</span>
              </label>
              <input
                type="password"
                value={config.anthropic_api_key}
                onChange={(e) => onChange("anthropic_api_key", e.target.value)}
                placeholder="sk-ant-..."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs font-mono focus:outline-none focus:border-sky-400"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-100 mb-1.5 uppercase">
                Claude Model Selection
              </label>
              <select
                value={config.anthropic_model || "claude-3-7-sonnet-20250219"}
                onChange={(e) => onChange("anthropic_model", e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-400 cursor-pointer"
              >
                {ANTHROPIC_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.desc}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Groq Settings */}
        {config.llm_provider === "groq" && (
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
            <div>
              <label className="flex items-center gap-2 font-bold text-slate-100 mb-1.5 uppercase">
                <Key className="w-4 h-4 text-orange-400" />
                <span>Groq API Key</span>
              </label>
              <input
                type="password"
                value={config.openai_api_key}
                onChange={(e) => onChange("openai_api_key", e.target.value)}
                placeholder="gsk_..."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs font-mono focus:outline-none focus:border-sky-400"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-100 mb-1.5 uppercase">
                Groq Model Selection
              </label>
              <select
                value={config.openai_model || "llama-3.3-70b-versatile"}
                onChange={(e) => onChange("openai_model", e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-400 cursor-pointer"
              >
                {GROQ_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.desc}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Ollama Settings */}
        {config.llm_provider === "ollama" && (
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
            <div>
              <label className="flex items-center gap-2 font-bold text-slate-100 mb-1.5 uppercase">
                <Server className="w-4 h-4 text-sky-400" />
                <span>Ollama Endpoint URL</span>
              </label>
              <input
                type="text"
                value={config.ollama_endpoint}
                onChange={(e) => onChange("ollama_endpoint", e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs font-mono focus:outline-none focus:border-sky-400"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block font-bold text-slate-100 uppercase">
                  Ollama Model Selection
                </label>
                <button
                  type="button"
                  onClick={() => setCustomOllamaInput(!customOllamaInput)}
                  className="text-[11px] text-sky-400 hover:text-sky-300 font-semibold"
                >
                  {customOllamaInput ? "Choose from list" : "Type custom model tag"}
                </button>
              </div>

              {customOllamaInput ? (
                <input
                  type="text"
                  value={config.ollama_model}
                  onChange={(e) => onChange("ollama_model", e.target.value)}
                  placeholder="e.g. llama3.2:1b, mistral-nemo, codellama:13b"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs font-mono focus:outline-none focus:border-sky-400"
                />
              ) : (
                <select
                  value={config.ollama_model || "llama3.2"}
                  onChange={(e) => onChange("ollama_model", e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-400 cursor-pointer"
                >
                  {OLLAMA_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {m.desc}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
