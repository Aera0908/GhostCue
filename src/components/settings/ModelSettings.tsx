import React, { useEffect, useState } from "react";
import { Cpu, Cloud, Download, CheckCircle, Key, Server, Globe, CheckSquare, Square, Zap, ExternalLink } from "lucide-react";
import { OpenRouterIcon, GeminiIcon, OpenAiIcon, ClaudeIcon, DeepSeekIcon, GroqIcon, OllamaIcon, CustomApiIcon } from "../common/ProviderIcons";
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
  downloaded?: boolean;
  path?: string;
}

const GEMINI_MODELS = [
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", desc: "Default • General-purpose AI, reasoning, multimodal" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", desc: "Complex reasoning, coding, mathematics & system design" },
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", desc: "Low-cost, high-volume requests" },
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", desc: "Multimodal applications, tool calling & low latency" },
  { id: "gemini-2.0-flash-lite", name: "Gemini 2.0 Flash Lite", desc: "Lightweight, cost-sensitive workloads" },
  { id: "gemini-2.0-flash-live-001", name: "Gemini 2.0 Flash Live", desc: "Realtime multimodal & voice interaction" },
  { id: "gemini-2.0-pro-exp-02-05", name: "Gemini 2.0 Pro Exp", desc: "Advanced coding & complex logic reasoning" },
  { id: "gemini-2.0-flash-thinking-exp-01-21", name: "Gemini 2.0 Flash Thinking", desc: "Chain-of-thought visible reasoning" },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", desc: "Legacy long-context applications & 2M context" },
  { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", desc: "Legacy fast multimodal applications" },
  { id: "gemini-1.5-flash-8b", name: "Gemini 1.5 Flash 8B", desc: "Lightweight inference" },
  { id: "gemini-exp-1206", name: "Gemini Exp 1206", desc: "Experimental multimodal benchmark leader" },
  { id: "learnlm-1.5-pro-experimental", name: "LearnLM 1.5 Pro Exp", desc: "Pedagogical & educational reasoning" },
];

const OPENAI_MODELS = [
  { id: "gpt-4o", name: "GPT-4o", desc: "Default • Flagship multimodal intelligence & code" },
  { id: "gpt-5", name: "GPT-5", desc: "General-purpose reasoning & advanced tasks" },
  { id: "gpt-5-mini", name: "GPT-5 Mini", desc: "Cost-efficient reasoning & application backends" },
  { id: "gpt-5-nano", name: "GPT-5 Nano", desc: "High-volume, low-cost inference" },
  { id: "gpt-4.1", name: "GPT-4.1", desc: "Coding, instruction following, long-context tasks" },
  { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", desc: "Affordable general-purpose applications" },
  { id: "gpt-4.1-nano", name: "GPT-4.1 Nano", desc: "Lightweight, high-throughput tasks" },
  { id: "o4-mini", name: "o4-mini", desc: "Efficient advanced reasoning" },
  { id: "o3", name: "o3", desc: "Advanced mathematics, reasoning, and coding" },
  { id: "o3-mini", name: "o3-mini", desc: "Efficient STEM and programming reasoning" },
  { id: "o1", name: "o1", desc: "Deep complex reasoning & algorithmic analysis" },
  { id: "o1-mini", name: "o1-mini", desc: "Fast STEM & coding reasoning specialist" },
  { id: "o1-preview", name: "o1-preview", desc: "High-capacity multi-step reasoning" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", desc: "Affordable multimodal AI" },
  { id: "chatgpt-4o-latest", name: "ChatGPT-4o Latest", desc: "Dynamic continuous ChatGPT model" },
  { id: "gpt-4-turbo", name: "GPT-4 Turbo", desc: "Legacy high-capacity text and vision tasks" },
  { id: "gpt-4", name: "GPT-4", desc: "Standard GPT-4 foundation model" },
  { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", desc: "Legacy fast model" },
];

const ANTHROPIC_MODELS = [
  { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", desc: "Default • Coding and complex instruction following" },
  { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5", desc: "Coding, agentic workflows, and analysis" },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", desc: "Fast, affordable inference" },
  { id: "claude-opus-4-1-20250805", name: "Claude Opus 4.1", desc: "Advanced coding and reasoning" },
  { id: "claude-opus-4-20250514", name: "Claude Opus 4", desc: "Complex reasoning and demanding tasks" },
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", desc: "Coding, reasoning, general-purpose AI" },
  { id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet", desc: "Hybrid reasoning with extended thinking" },
  { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", desc: "Fast, low-cost tasks" },
  { id: "claude-3-opus-20240229", name: "Claude 3 Opus", desc: "High-capability writing and analysis" },
  { id: "claude-3-sonnet-20240229", name: "Claude 3 Sonnet", desc: "Legacy balanced model" },
  { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku", desc: "Lightweight inference" },
];

const GROQ_MODELS = [
  { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile", desc: "Recommended • 70B parameters, sub-100ms" },
  { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant", desc: "Ultra-low latency, sub-50ms token generation" },
  { id: "deepseek-r1-distill-llama-70b", name: "DeepSeek R1 Distill 70B", desc: "DeepSeek reasoning on Groq LPU" },
  { id: "qwen-2.5-32b", name: "Qwen 2.5 32B", desc: "High reasoning multilingual model on Groq" },
  { id: "qwen-2.5-coder-32b", name: "Qwen 2.5 Coder 32B", desc: "Code intelligence specialist on Groq" },
  { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B", desc: "High throughput MoE architecture (32k context)" },
  { id: "gemma2-9b-it", name: "Google Gemma 2 9B", desc: "Compact Google language model" },
];

const OLLAMA_MODELS = [
  { id: "qwen2.5-coder:7b", name: "Qwen 2.5 Coder (7B)", desc: "Default • Optimized for programming & architecture" },
  { id: "qwen2.5-coder:14b", name: "Qwen 2.5 Coder (14B)", desc: "High-accuracy code & algorithm reasoning" },
  { id: "qwen2.5-coder:32b", name: "Qwen 2.5 Coder (32B)", desc: "Flagship local code synthesis" },
  { id: "llama-4-scout", name: "Llama 4 Scout", desc: "Next-gen Meta open weights model" },
  { id: "llama-4-maverick", name: "Llama 4 Maverick", desc: "High capacity Meta open model" },
  { id: "llama3.3:70b", name: "Llama 3.3 (70B)", desc: "Flagship open weights reasoning" },
  { id: "llama3.1:8b", name: "Llama 3.1 (8B)", desc: "Balanced local performance & conversation" },
  { id: "llama3.1:70b", name: "Llama 3.1 (70B)", desc: "High capacity open weights model" },
  { id: "llama3.1:405b", name: "Llama 3.1 (405B)", desc: "Maximum capacity open weights" },
  { id: "qwen2.5:7b", name: "Qwen 2.5 (7B)", desc: "General instruction & technical tasks" },
  { id: "qwen2.5:14b", name: "Qwen 2.5 (14B)", desc: "Enhanced technical reasoning" },
  { id: "qwen2.5:32b", name: "Qwen 2.5 (32B)", desc: "Deep instruction following" },
  { id: "llama3:latest", name: "Llama 3 (8B)", desc: "Standard Meta Llama 3 model" },
  { id: "phi3:mini", name: "Microsoft Phi-3 Mini (3.8B)", desc: "Compact & efficient on CPU" },
  { id: "llama3.2:3b", name: "Llama 3.2 (3B)", desc: "Lightweight & fast on local CPU/GPU" },
  { id: "llama3.2:1b", name: "Llama 3.2 (1B)", desc: "Ultra-compact fast model" },
  { id: "llama3.2-vision", name: "Llama 3.2 Vision", desc: "Local multimodal screen vision" },
  { id: "deepseek-r1:7b", name: "DeepSeek R1 (7B)", desc: "Qwen-distilled local chain-of-thought" },
  { id: "deepseek-r1:8b", name: "DeepSeek R1 (8B)", desc: "Llama-distilled local chain-of-thought" },
  { id: "deepseek-r1:14b", name: "DeepSeek R1 (14B)", desc: "Enhanced local reasoning capacity" },
  { id: "deepseek-r1:32b", name: "DeepSeek R1 (32B)", desc: "Frontier local reasoning capacity" },
  { id: "deepseek-v3", name: "DeepSeek V3", desc: "Local MoE model" },
  { id: "mistral:7b", name: "Mistral (7B)", desc: "General technical Q&A" },
  { id: "phi4:14b", name: "Microsoft Phi-4 (14B)", desc: "High reasoning capacity" },
  { id: "gemma2:9b", name: "Google Gemma 2 (9B)", desc: "Fast Google local model" },
  { id: "gemma2:27b", name: "Google Gemma 2 (27B)", desc: "High-capacity Google local model" },
  { id: "codellama:7b", name: "CodeLlama (7B)", desc: "Meta code specialist" },
];

const DEEPSEEK_MODELS = [
  { id: "deepseek-chat", name: "DeepSeek Chat (V3)", desc: "Default • Flagship 671B MoE, general conversation & coding" },
  { id: "deepseek-reasoner", name: "DeepSeek Reasoner (R1)", desc: "Frontier chain-of-thought reasoning, math & architecture" },
  { id: "deepseek-v3", name: "DeepSeek V3", desc: "Flagship base MoE model" },
  { id: "deepseek-r1", name: "DeepSeek R1", desc: "Full open reasoning model" },
];

const OPENROUTER_MODELS = [
  { id: "deepseek/deepseek-chat", name: "DeepSeek V3", desc: "Flagship 671B MoE • Ultra fast & cost-efficient" },
  { id: "deepseek/deepseek-r1", name: "DeepSeek R1", desc: "Frontier reasoning & chain-of-thought coding" },
  { id: "anthropic/claude-3.7-sonnet", name: "Claude 3.7 Sonnet", desc: "Hybrid reasoning with extended thinking" },
  { id: "openai/gpt-4o", name: "OpenAI GPT-4o", desc: "Multimodal flagship model" },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", desc: "Ultra-fast multimodal inference & coding" },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", desc: "Next-gen complex reasoning & system design" },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", desc: "Meta open-weights flagship" },
  { id: "qwen/qwen-2.5-coder-32b-instruct", name: "Qwen 2.5 Coder 32B", desc: "Alibaba coding powerhouse" },
];

interface CustomPreset {
  name: string;
  endpoint: string;
  defaultModel: string;
  models: { id: string; name: string; desc: string }[];
}

const CUSTOM_PRESETS: CustomPreset[] = [
  {
    name: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1",
    defaultModel: "deepseek/deepseek-r1",
    models: [
      { id: "deepseek/deepseek-r1", name: "DeepSeek R1", desc: "OpenRouter reasoning leader" },
      { id: "deepseek/deepseek-chat", name: "DeepSeek V3", desc: "High-speed flagship MoE" },
      { id: "anthropic/claude-3.7-sonnet", name: "Claude 3.7 Sonnet", desc: "Hybrid reasoning with extended thinking" },
      { id: "openai/gpt-4o", name: "OpenAI GPT-4o", desc: "Multimodal flagship model" },
      { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", desc: "Next-gen reasoning & code" },
      { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", desc: "Ultra-fast multimodal inference" },
      { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", desc: "Meta open flagship" },
      { id: "qwen/qwen-2.5-coder-32b-instruct", name: "Qwen 2.5 Coder 32B", desc: "Alibaba coding powerhouse" },
    ],
  },
  {
    name: "Mistral AI",
    endpoint: "https://api.mistral.ai/v1",
    defaultModel: "mistral-large-latest",
    models: [
      { id: "mistral-large-latest", name: "Mistral Large", desc: "Top-tier reasoning & code synthesis" },
      { id: "codestral-latest", name: "Codestral", desc: "Specialized for 80+ programming languages" },
      { id: "mistral-medium-latest", name: "Mistral Medium", desc: "Balanced enterprise performance" },
      { id: "mistral-small-latest", name: "Mistral Small", desc: "Cost-effective fast inference" },
      { id: "pixtral-large-latest", name: "Pixtral Large", desc: "Frontier multimodal vision model" },
      { id: "ministral-8b-latest", name: "Ministral 8B", desc: "Ultra-compact edge inference" },
      { id: "ministral-3b-latest", name: "Ministral 3B", desc: "Sub-second lightweight tasks" },
    ],
  },
  {
    name: "xAI Grok",
    endpoint: "https://api.x.ai/v1",
    defaultModel: "grok-2-vision-1212",
    models: [
      { id: "grok-4", name: "Grok 4", desc: "Next-generation frontier xAI model" },
      { id: "grok-4-fast", name: "Grok 4 Fast", desc: "High-throughput rapid response" },
      { id: "grok-3", name: "Grok 3", desc: "Frontier reasoning & math/coding engine" },
      { id: "grok-3-mini", name: "Grok 3 Mini", desc: "Efficient STEM & logic reasoning" },
      { id: "grok-2-vision-1212", name: "Grok 2 Vision", desc: "Multimodal text & screen understanding" },
    ],
  },
  {
    name: "Cohere",
    endpoint: "https://api.cohere.com/v2",
    defaultModel: "command-r-plus",
    models: [
      { id: "command-a", name: "Command A", desc: "Next-generation enterprise agentic reasoning" },
      { id: "command-r-plus", name: "Command R+", desc: "Optimized for enterprise RAG and tool use" },
      { id: "command-r", name: "Command R", desc: "Fast, scalable enterprise reasoning" },
      { id: "command-r7b-12-2024", name: "Command R7B", desc: "Lightweight conversational model" },
    ],
  },
  {
    name: "Alibaba Qwen",
    endpoint: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-max",
    models: [
      { id: "qwen-max", name: "Qwen Max", desc: "Flagship proprietary model with complex reasoning" },
      { id: "qwen-plus", name: "Qwen Plus", desc: "High capability balanced speed and cost" },
      { id: "qwen-turbo", name: "Qwen Turbo", desc: "Ultra-fast low latency throughput" },
      { id: "qwen2.5-coder-32b-instruct", name: "Qwen 2.5 Coder (32B)", desc: "Code intelligence specialist" },
      { id: "qwen2.5-72b-instruct", name: "Qwen 2.5 (72B)", desc: "High-capacity open weights reasoning" },
      { id: "qwen-vl-max", name: "Qwen VL Max", desc: "Flagship multimodal vision model" },
    ],
  },
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
  const [customGeminiInput, setCustomGeminiInput] = useState(
    () => !!config.gemini_model && !GEMINI_MODELS.some((m) => m.id === config.gemini_model)
  );
  const [customOpenAIInput, setCustomOpenAIInput] = useState(
    () => !!config.openai_model && !OPENAI_MODELS.some((m) => m.id === config.openai_model)
  );
  const [customAnthropicInput, setCustomAnthropicInput] = useState(
    () => !!config.anthropic_model && !ANTHROPIC_MODELS.some((m) => m.id === config.anthropic_model)
  );
  const [customDeepSeekInput, setCustomDeepSeekInput] = useState(
    () => !!config.deepseek_model && !DEEPSEEK_MODELS.some((m) => m.id === config.deepseek_model)
  );
  const [customGroqInput, setCustomGroqInput] = useState(
    () => !!config.openai_model && !GROQ_MODELS.some((m) => m.id === config.openai_model)
  );
  const [customOllamaInput, setCustomOllamaInput] = useState(
    () => !!config.ollama_model && !OLLAMA_MODELS.some((m) => m.id === config.ollama_model)
  );
  const [customOpenRouterInput, setCustomOpenRouterInput] = useState(
    () => !!(config.openrouter_model || config.custom_model) && !OPENROUTER_MODELS.some((m) => m.id === (config.openrouter_model || config.custom_model))
  );

  useEffect(() => {
    TauriApi.getAvailableWhisperModels().then((models) => {
      setWhisperModels(models as WhisperModelInfo[]);
    });
  }, []);

  const handleSelectWhisper = async (m: WhisperModelInfo) => {
    onChange("whisper_model_size", m.name);
    if (m.path) onChange("whisper_model_path", m.path);
    onChange("stt_provider", "local_whisper");
    try {
      const current = await TauriApi.getConfig();
      await TauriApi.saveConfig({
        ...current,
        whisper_model_size: m.name,
        whisper_model_path: m.path || current.whisper_model_path,
        stt_provider: "local_whisper",
      });
      setDownloadSuccess(`Active local model switched to: ${m.name}`);
    } catch (e) {
      console.warn("Auto save on model select:", e);
    }
  };

  const handleDownloadWhisper = async (modelName: string) => {
    setDownloadingModel(modelName);
    setDownloadProgress(0);
    setDownloadSuccess(null);

    try {
      const path = await TauriApi.downloadWhisperModel(modelName);
      onChange("whisper_model_path", path);
      onChange("whisper_model_size", modelName);
      onChange("stt_provider", "local_whisper");
      try {
        const current = await TauriApi.getConfig();
        await TauriApi.saveConfig({
          ...current,
          whisper_model_size: modelName,
          whisper_model_path: path,
          stt_provider: "local_whisper",
        });
      } catch {}
      setWhisperModels((prev) =>
        prev.map((m) => (m.name === modelName ? { ...m, downloaded: true, path } : m))
      );
      setDownloadSuccess(`${modelName} downloaded & selected as active model!`);
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
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            { id: "local_whisper", label: "Local Whisper", sub: "Offline • 100% Free", icon: Cpu, badge: "Recommended" },
            { id: "groq", label: "Groq Whisper", sub: "Free API • ~200ms", icon: GroqIcon, badge: "Free" },
            { id: "openrouter", label: "OpenRouter Audio", sub: "Gemini 2.5 Flash", icon: OpenRouterIcon },
            { id: "deepgram", label: "Deepgram", sub: "Nova-2 Streaming", icon: Zap },
            { id: "cloud_whisper", label: "OpenAI Whisper", sub: "Whisper-1 API", icon: OpenAiIcon },
          ].map((prov) => {
            const Icon = prov.icon;
            const isSelected = config.stt_provider === prov.id || (!config.stt_provider && prov.id === "local_whisper");
            return (
              <button
                key={prov.id}
                type="button"
                onClick={() => onChange("stt_provider", prov.id)}
                className={`p-3 text-left rounded-xl border transition-all relative flex flex-col justify-between ${
                  isSelected
                    ? "bg-slate-800 border-sky-500/80 text-slate-100 font-bold shadow-[0_0_12px_rgba(14,165,233,0.15)] ring-1 ring-sky-500/50"
                    : "bg-slate-950/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Icon className="w-4 h-4 text-sky-400" />
                    {prov.badge && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-extrabold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                        {prov.badge}
                      </span>
                    )}
                  </div>
                  <span className={`block font-bold text-xs ${isSelected ? "text-slate-100" : "text-slate-300"}`}>
                    {prov.label}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 mt-1">{prov.sub}</span>
              </button>
            );
          })}
        </div>

        {/* Local Whisper Options */}
        {(config.stt_provider === "local_whisper" || !config.stt_provider) && (
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-slate-200 font-bold text-xs uppercase">
                {t.settings.whisperModel} (100% Offline GGML)
              </label>
              <span className="text-[11px] text-sky-400 font-medium">
                Active: <strong>{config.whisper_model_size || "base.en"}</strong>
              </span>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {whisperModels.map((m) => {
                const isSelected = (config.whisper_model_size || "base.en") === m.name;
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
                        {m.name === "base.en" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                            Recommended
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {isDownloading ? (
                          <span className="text-xs text-sky-400 font-semibold flex items-center gap-1.5">
                            <Download className="w-3.5 h-3.5 animate-bounce" />
                            <span>{t.settings.downloading}</span>
                          </span>
                        ) : m.downloaded ? (
                          isSelected ? (
                            <span className="flex items-center gap-1 px-3 py-1 bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 rounded-lg text-xs font-bold shadow-sm">
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                              <span>✓ Selected</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSelectWhisper(m)}
                              className="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-lg transition-all shadow-sm"
                            >
                              Select
                            </button>
                          )
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDownloadWhisper(m.name)}
                            className="flex items-center gap-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold rounded-lg transition-colors border border-slate-700"
                          >
                            <Download className="w-3.5 h-3.5 text-sky-400" />
                            <span>{t.settings.downloadModel}</span>
                          </button>
                        )}
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
                          Downloading weights ({downloadProgress}%)...
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

        {/* Groq Whisper Options */}
        {config.stt_provider === "groq" && (
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 font-bold text-slate-100 uppercase text-xs">
                <GroqIcon className="w-4 h-4" />
                <span>Groq API Key (100% Free)</span>
              </label>
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-sky-400 hover:text-sky-300 underline font-semibold flex items-center gap-1"
              >
                <span>Get free Groq key</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <input
              type="password"
              value={config.groq_api_key || ""}
              onChange={(e) => onChange("groq_api_key", e.target.value)}
              placeholder="gsk_..."
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 font-semibold">Model:</span>
              <select
                value={config.groq_whisper_model || "whisper-large-v3-turbo"}
                onChange={(e) => onChange("groq_whisper_model", e.target.value)}
                className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-xs font-mono"
              >
                <option value="whisper-large-v3-turbo">whisper-large-v3-turbo (Fastest, ~200ms)</option>
                <option value="whisper-large-v3">whisper-large-v3 (Standard High Precision)</option>
              </select>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Groq Cloud Whisper runs Whisper Large on specialized LPU hardware at ~200ms response time with a generous free tier.
            </p>
          </div>
        )}

        {/* OpenRouter Audio Options */}
        {config.stt_provider === "openrouter" && (
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 font-bold text-slate-100 uppercase text-xs">
                <OpenRouterIcon className="w-4 h-4" />
                <span>OpenRouter Audio Model</span>
              </label>
              <span className="text-[11px] font-semibold text-emerald-400">
                {config.openrouter_api_key ? "✓ OpenRouter Key Configured" : "⚠️ Key Missing"}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Uses your OpenRouter API key to transcribe speech via <strong>Google Gemini 2.5 Flash Audio</strong>.
            </p>
            <div className="p-2.5 bg-amber-950/30 border border-amber-500/40 rounded text-[11px] text-amber-200 leading-relaxed">
              ⚠️ <strong>Note:</strong> OpenRouter requires at least $0.50 in credit balance for multimodal audio processing. If you have expired credits, use <strong>Local Whisper GGML</strong> (100% free offline) or <strong>Groq Whisper</strong> (100% free cloud API).
            </div>
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

        {/* Cloud Whisper (OpenAI) Options */}
        {config.stt_provider === "cloud_whisper" && (
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
            <label className="flex items-center gap-2 font-bold text-slate-100 uppercase">
              <Key className="w-4 h-4 text-emerald-400" />
              <span>OpenAI API Key (Whisper-1)</span>
            </label>
            <input
              type="password"
              value={config.openai_api_key}
              onChange={(e) => onChange("openai_api_key", e.target.value)}
              placeholder="sk-..."
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
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {[
            { id: "openrouter", label: "OpenRouter", icon: OpenRouterIcon },
            { id: "gemini", label: "Google Gemini", icon: GeminiIcon },
            { id: "openai", label: "OpenAI GPT", icon: OpenAiIcon },
            { id: "anthropic", label: "Claude", icon: ClaudeIcon },
            { id: "deepseek", label: "DeepSeek", icon: DeepSeekIcon },
            { id: "groq", label: "Groq LPU", icon: GroqIcon },
            { id: "ollama", label: "Ollama Local", icon: OllamaIcon },
            { id: "custom", label: "Custom / API", icon: CustomApiIcon },
          ].map((prov) => {
            const Icon = prov.icon;
            const isSelected = config.llm_provider === prov.id;
            return (
              <button
                key={prov.id}
                type="button"
                onClick={() => onChange("llm_provider", prov.id)}
                className={`py-2.5 px-2 rounded-xl border text-center font-bold text-xs transition-all flex flex-col items-center justify-center gap-1.5 ${
                  isSelected
                    ? "bg-slate-800 border-sky-500/70 text-white shadow-md ring-1 ring-sky-500/30"
                    : "bg-slate-950 border-slate-800/90 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                }`}
              >
                <div className="w-5 h-5 flex items-center justify-center">
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-[11px] truncate w-full">{prov.label}</span>
              </button>
            );
          })}
        </div>

        {/* Smart Model Routing (Cost & Accuracy Optimizer) */}
        <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Zap className="w-4 h-4 text-amber-400" />
              <div>
                <p className="font-bold text-slate-100 uppercase">Smart Model Routing (Cost & Accuracy Optimizer)</p>
                <p className="text-[11px] text-slate-400">
                  Flagship model for Coding & Screen OCR • Budget model for Answers & Chat
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={config.smart_model_routing ?? true}
              onChange={(e) => onChange("smart_model_routing", e.target.checked)}
              className="w-4 h-4 accent-amber-500 cursor-pointer"
            />
          </div>
          <p className="text-xs text-slate-300 leading-relaxed pt-1">
            Automatically routes complex <strong className="text-amber-300">Coding Problems</strong> and <strong className="text-amber-300">Screen OCR</strong> to high-accuracy flagship models (<code className="text-amber-300 font-mono">gpt-4o</code> / <code className="text-amber-300 font-mono">claude-3-7-sonnet</code> / <code className="text-amber-300 font-mono">gemini-2.5-pro</code>), while essays, paragraphs, summaries, and conversational STAR answers use fast, budget models (<code className="text-amber-300 font-mono">gpt-4o-mini</code> / <code className="text-amber-300 font-mono">claude-3-5-haiku</code> / <code className="text-amber-300 font-mono">gemini-2.5-flash</code>) to save up to 95% in token costs.
          </p>
          <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              Saves ~95% API costs on chat & essays
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-400"></span>
              Competitive programming accuracy for code & vision
            </span>
          </div>
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
              <div className="flex items-center justify-between mb-1.5">
                <label className="block font-bold text-slate-100 uppercase">
                  Gemini Model Selection
                </label>
                <button
                  type="button"
                  onClick={() => setCustomGeminiInput(!customGeminiInput)}
                  className="text-[11px] text-sky-400 hover:text-sky-300 font-semibold"
                >
                  {customGeminiInput ? "Choose from list" : "Type custom model tag"}
                </button>
              </div>
              {customGeminiInput ? (
                <input
                  type="text"
                  value={config.gemini_model || ""}
                  onChange={(e) => onChange("gemini_model", e.target.value)}
                  placeholder="e.g. gemini-2.5-flash, gemini-2.5-pro, gemini-2.0-flash"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs font-mono focus:outline-none focus:border-sky-400"
                />
              ) : (
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
              )}
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
              <div className="flex items-center justify-between mb-1.5">
                <label className="block font-bold text-slate-100 uppercase">
                  OpenAI Model Selection
                </label>
                <button
                  type="button"
                  onClick={() => setCustomOpenAIInput(!customOpenAIInput)}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold"
                >
                  {customOpenAIInput ? "Choose from list" : "Type custom model tag"}
                </button>
              </div>
              {customOpenAIInput ? (
                <input
                  type="text"
                  value={config.openai_model || ""}
                  onChange={(e) => onChange("openai_model", e.target.value)}
                  placeholder="e.g. gpt-4o, o3-mini, o1, chatgpt-4o-latest"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs font-mono focus:outline-none focus:border-sky-400"
                />
              ) : (
                <select
                  value={config.openai_model || "gpt-4o"}
                  onChange={(e) => onChange("openai_model", e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-400 cursor-pointer"
                >
                  {OPENAI_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {m.desc}
                    </option>
                  ))}
                </select>
              )}
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
              <div className="flex items-center justify-between mb-1.5">
                <label className="block font-bold text-slate-100 uppercase">
                  Claude Model Selection
                </label>
                <button
                  type="button"
                  onClick={() => setCustomAnthropicInput(!customAnthropicInput)}
                  className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold"
                >
                  {customAnthropicInput ? "Choose from list" : "Type custom model tag"}
                </button>
              </div>
              {customAnthropicInput ? (
                <input
                  type="text"
                  value={config.anthropic_model || ""}
                  onChange={(e) => onChange("anthropic_model", e.target.value)}
                  placeholder="e.g. claude-3-5-sonnet-20241022, claude-3-7-sonnet-20250219"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs font-mono focus:outline-none focus:border-sky-400"
                />
              ) : (
                <select
                  value={config.anthropic_model || "claude-3-5-sonnet-20241022"}
                  onChange={(e) => onChange("anthropic_model", e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-400 cursor-pointer"
                >
                  {ANTHROPIC_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {m.desc}
                    </option>
                  ))}
                </select>
              )}
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
              <div className="flex items-center justify-between mb-1.5">
                <label className="block font-bold text-slate-100 uppercase">
                  Groq Model Selection
                </label>
                <button
                  type="button"
                  onClick={() => setCustomGroqInput(!customGroqInput)}
                  className="text-[11px] text-orange-400 hover:text-orange-300 font-semibold"
                >
                  {customGroqInput ? "Choose from list" : "Type custom model tag"}
                </button>
              </div>
              {customGroqInput ? (
                <input
                  type="text"
                  value={config.openai_model || ""}
                  onChange={(e) => onChange("openai_model", e.target.value)}
                  placeholder="e.g. llama-3.3-70b-versatile, deepseek-r1-distill-llama-70b"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs font-mono focus:outline-none focus:border-sky-400"
                />
              ) : (
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
              )}
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
                  value={config.ollama_model || "qwen2.5-coder:7b"}
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

        {/* DeepSeek Settings */}
        {config.llm_provider === "deepseek" && (
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
            <div>
              <label className="flex items-center gap-2 font-bold text-slate-100 mb-1.5 uppercase">
                <Key className="w-4 h-4 text-blue-400" />
                <span>DeepSeek API Key</span>
              </label>
              <input
                type="password"
                value={config.deepseek_api_key || config.custom_api_key || ""}
                onChange={(e) => {
                  onChange("deepseek_api_key", e.target.value);
                  onChange("custom_api_key", e.target.value);
                }}
                placeholder="sk-..."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs font-mono focus:outline-none focus:border-sky-400"
              />
              <p className="text-[11px] text-slate-400 mt-1">Get an API key at platform.deepseek.com (pay-as-you-go / prepaid credits)</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block font-bold text-slate-100 uppercase">
                  DeepSeek Model Selection
                </label>
                <button
                  type="button"
                  onClick={() => setCustomDeepSeekInput(!customDeepSeekInput)}
                  className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold"
                >
                  {customDeepSeekInput ? "Choose from list" : "Type custom model tag"}
                </button>
              </div>
              {customDeepSeekInput ? (
                <input
                  type="text"
                  value={config.deepseek_model || "deepseek-chat"}
                  onChange={(e) => onChange("deepseek_model", e.target.value)}
                  placeholder="e.g. deepseek-chat, deepseek-reasoner, deepseek-v3, deepseek-r1"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs font-mono focus:outline-none focus:border-sky-400"
                />
              ) : (
                <select
                  value={config.deepseek_model || "deepseek-chat"}
                  onChange={(e) => onChange("deepseek_model", e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-400 cursor-pointer"
                >
                  {DEEPSEEK_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {m.desc}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}

        {/* OpenRouter AI Settings */}
        {config.llm_provider === "openrouter" && (
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-teal-400" />
                <span className="font-bold text-slate-100 uppercase text-xs">OpenRouter AI Configuration</span>
              </div>
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-teal-400 hover:text-teal-300 flex items-center gap-1 font-medium transition-colors"
              >
                <span>Get API Key</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* STT Notice banner */}
            <div className="p-2.5 bg-teal-950/40 border border-teal-800/60 rounded-lg text-xs text-teal-200/90 leading-relaxed">
              <span className="font-bold text-teal-300">💡 Important: </span>
              OpenRouter powers your interview answers, reasoning & coding assistance. OpenRouter does not provide audio transcription. For live Speech-to-Text (STT), use <strong className="text-white">Deepgram (free credits)</strong> or <strong className="text-white">Groq Whisper (free tier)</strong> in the STT Engine section above.
            </div>

            <div>
              <label className="flex items-center gap-2 font-bold text-slate-100 mb-1.5 uppercase text-xs">
                <Key className="w-4 h-4 text-teal-400" />
                <span>OpenRouter API Key</span>
              </label>
              <input
                type="password"
                value={config.openrouter_api_key || config.custom_api_key || ""}
                onChange={(e) => {
                  onChange("openrouter_api_key", e.target.value);
                  onChange("custom_api_key", e.target.value);
                }}
                placeholder="sk-or-v1-..."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 text-xs font-mono focus:outline-none focus:border-teal-400"
              />
            </div>

            {/* OpenRouter Model Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="font-bold text-slate-100 uppercase text-xs">
                  OpenRouter Model
                </label>
                <button
                  type="button"
                  onClick={() => setCustomOpenRouterInput(!customOpenRouterInput)}
                  className="text-[11px] text-teal-400 hover:text-teal-300 transition-colors"
                >
                  {customOpenRouterInput ? "Choose from list" : "Enter custom model ID"}
                </button>
              </div>

              {!customOpenRouterInput ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {OPENROUTER_MODELS.map((m) => {
                    const activeModel = config.openrouter_model || config.custom_model || "deepseek/deepseek-chat";
                    const isSelected = activeModel === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          onChange("openrouter_model", m.id);
                          onChange("custom_model", m.id);
                        }}
                        className={`p-2.5 text-left rounded-lg border transition-all ${
                          isSelected
                            ? "bg-teal-950/70 border-teal-500/70 text-slate-100 shadow-sm"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`font-bold text-xs ${isSelected ? "text-teal-300" : "text-slate-200"}`}>
                            {m.name}
                          </span>
                          {isSelected && <CheckCircle className="w-3.5 h-3.5 text-teal-400" />}
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-1">{m.desc}</p>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">{m.id}</p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={config.openrouter_model || config.custom_model || ""}
                    onChange={(e) => {
                      onChange("openrouter_model", e.target.value);
                      onChange("custom_model", e.target.value);
                    }}
                    placeholder="e.g. deepseek/deepseek-r1, anthropic/claude-3.7-sonnet, openai/gpt-4o"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs font-mono focus:outline-none focus:border-teal-400"
                  />
                  <p className="text-[11px] text-slate-500">
                    Enter any valid model identifier from <a href="https://openrouter.ai/models" target="_blank" rel="noreferrer" className="text-teal-400 underline">openrouter.ai/models</a>
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Custom OpenAI-Compatible (Mistral, xAI, Cohere, Bedrock, etc.) Settings */}
        {config.llm_provider === "custom" && (
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-3.5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="font-bold text-slate-100 uppercase text-xs">
                  Quick Provider Presets
                </label>
                <span className="text-[11px] text-slate-400">Click to autofill endpoint & recommended model</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                {CUSTOM_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => {
                      onChange("custom_endpoint", preset.endpoint);
                      onChange("custom_model", preset.defaultModel);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all text-center ${
                      config.custom_endpoint === preset.endpoint
                        ? "bg-teal-950/80 border-teal-500/70 text-teal-200 shadow-sm"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                    }`}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 font-bold text-slate-100 mb-1.5 uppercase">
                <Globe className="w-4 h-4 text-teal-400" />
                <span>OpenAI-Compatible Endpoint URL</span>
              </label>
              <input
                type="text"
                value={config.custom_endpoint}
                onChange={(e) => onChange("custom_endpoint", e.target.value)}
                placeholder="https://openrouter.ai/api/v1 (or Mistral, xAI, Cohere, Qwen)"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs font-mono focus:outline-none focus:border-teal-400"
              />
            </div>

            <div>
              <label className="flex items-center gap-2 font-bold text-slate-100 mb-1.5 uppercase">
                <Key className="w-4 h-4 text-teal-400" />
                <span>API Key</span>
              </label>
              <input
                type="password"
                value={config.custom_api_key}
                onChange={(e) => onChange("custom_api_key", e.target.value)}
                placeholder="sk-or-... or provider API key"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs font-mono focus:outline-none focus:border-teal-400"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-100 mb-1.5 uppercase">
                Model Identifier
              </label>
              <input
                type="text"
                value={config.custom_model}
                onChange={(e) => onChange("custom_model", e.target.value)}
                placeholder="e.g. deepseek/deepseek-r1, mistral-large-latest, grok-3, command-r-plus"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs font-mono focus:outline-none focus:border-teal-400"
              />

              {/* Matched preset model suggestions */}
              {(() => {
                const activePreset = CUSTOM_PRESETS.find((p) => p.endpoint === config.custom_endpoint);
                if (!activePreset) return null;
                return (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-800/80">
                    <p className="text-[11px] text-slate-400 font-semibold mb-1.5">
                      Popular {activePreset.name} Models:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {activePreset.models.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => onChange("custom_model", m.id)}
                          className={`text-[11px] px-2 py-1 rounded border font-mono transition-all ${
                            config.custom_model === m.id
                              ? "bg-teal-900/60 border-teal-500/80 text-teal-200"
                              : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                          }`}
                          title={m.desc}
                        >
                          {m.id}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
