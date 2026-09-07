import React, { useEffect, useState } from "react";
import { Cpu, Cloud, Download, CheckCircle, Key, Server, Globe } from "lucide-react";
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

export const ModelSettings: React.FC<ModelSettingsProps> = ({ config, onChange }) => {
  const { t, sttLanguages } = useTranslation();
  const [whisperModels, setWhisperModels] = useState<WhisperModelInfo[]>([]);
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

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

  return (
    <div className="space-y-4 text-sm font-sans">
      {/* --- STT Engine Section --- */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3 font-sans text-xs">
        <h4 className="flex items-center gap-2 font-bold text-slate-100 uppercase tracking-wider">
          <Cpu className="w-4 h-4 text-sky-400" />
          <span>{t.settings.sttProvider}</span>
        </h4>

        {/* STT Language Selector */}
        <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-1.5">
          <div className="flex items-center gap-2">
            <Globe className="w-3.5 h-3.5 text-sky-400" />
            <label className="font-bold text-slate-100 uppercase text-xs">
              {t.settings.sttLanguage}
            </label>
          </div>
          <p className="text-[11px] text-slate-400">{t.settings.sttLanguageDesc}</p>
          <select
            value={config.stt_language || "auto"}
            onChange={(e) => onChange("stt_language", e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 text-slate-100 rounded-lg text-xs focus:border-sky-500 focus:outline-none cursor-pointer"
          >
            {sttLanguages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag} {l.label}
              </option>
            ))}
          </select>
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

        {/* Status Banner */}
        {(config.stt_provider === "cloud_whisper" || config.stt_provider === "openai_whisper" || (!config.stt_provider && config.openai_api_key)) && (
          <div className="p-3 bg-emerald-950/60 border border-emerald-600/40 rounded-lg space-y-1 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-emerald-300">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>OpenAI Cloud Whisper is Active</span>
            </div>
            <p className="text-emerald-200/90 text-xs leading-relaxed">
              Uses your OpenAI API key configured below. Transcribes speech instantly with zero local CPU load.
            </p>
          </div>
        )}

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
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-400 text-xs"
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
        <div className="grid grid-cols-4 gap-2">
          {(["ollama", "openai", "anthropic", "groq"] as const).map((prov) => (
            <button
              key={prov}
              type="button"
              onClick={() => onChange("llm_provider", prov)}
              className={`py-2 px-3 rounded-lg border text-center font-bold text-xs uppercase transition-all ${
                config.llm_provider === prov
                  ? "bg-slate-800 border-sky-500/60 text-sky-300 shadow-sm"
                  : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {prov}
            </button>
          ))}
        </div>

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
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-400"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-100 mb-1.5 uppercase">
                Ollama Model Name
              </label>
              <input
                type="text"
                value={config.ollama_model}
                onChange={(e) => onChange("ollama_model", e.target.value)}
                placeholder="llama3.2, mistral-nemo, deepseek-r1:8b"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-400"
              />
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
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-400"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-100 mb-1.5 uppercase">
                OpenAI Model
              </label>
              <input
                type="text"
                value={config.openai_model}
                onChange={(e) => onChange("openai_model", e.target.value)}
                placeholder="gpt-4o, gpt-4o-mini"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-400"
              />
            </div>
          </div>
        )}

        {/* Anthropic Settings */}
        {config.llm_provider === "anthropic" && (
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
            <div>
              <label className="flex items-center gap-2 font-bold text-slate-100 mb-1.5 uppercase">
                <Key className="w-4 h-4 text-amber-400" />
                <span>Anthropic API Key</span>
              </label>
              <input
                type="password"
                value={config.anthropic_api_key}
                onChange={(e) => onChange("anthropic_api_key", e.target.value)}
                placeholder="sk-ant-..."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-400"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-100 mb-1.5 uppercase">
                Claude Model
              </label>
              <input
                type="text"
                value={config.anthropic_model}
                onChange={(e) => onChange("anthropic_model", e.target.value)}
                placeholder="claude-3-5-sonnet-20241022"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-400"
              />
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
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-400"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-100 mb-1.5 uppercase">
                Groq Model
              </label>
              <input
                type="text"
                value={config.openai_model}
                onChange={(e) => onChange("openai_model", e.target.value)}
                placeholder="llama-3.3-70b-versatile"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-400"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
