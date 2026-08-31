import React, { useEffect, useState } from "react";
import { Cpu, Cloud, Download, CheckCircle, Key, Server } from "lucide-react";
import { AppConfig } from "../../types/config";
import { TauriApi } from "../../services/tauriApi";

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

    // If using Tauri, model-download-progress events are emitted from backend
    try {
      const path = await TauriApi.downloadWhisperModel(modelName);
      onChange("whisper_model_path", path);
      onChange("whisper_model_size", modelName);
      onChange("stt_provider", "local_whisper");
      setDownloadSuccess(`Model ${modelName} installed & active!`);
    } catch (err: any) {
      alert(`Failed to download model: ${err}`);
    } finally {
      setDownloadingModel(null);
    }
  };

  return (
    <div className="space-y-4 text-sm font-sans">
      {/* --- STT Engine Section --- */}
      <div className="p-3 bg-[#121212] border border-[#1f1f1f] space-y-2.5 font-mono text-xs">
        <h4 className="flex items-center gap-2 font-bold text-white uppercase">
          <Cpu className="w-3.5 h-3.5 text-[#38bdf8]" />
          <span>Speech-to-Text (STT) Engine</span>
        </h4>

        {/* Engine Switcher (3 options) */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => onChange("stt_provider", "cloud_whisper")}
            className={`p-2 text-left border transition-colors ${
              config.stt_provider === "cloud_whisper" || config.stt_provider === "openai_whisper" || (!config.stt_provider && config.openai_api_key)
                ? "bg-[#1c1c1c] border-white text-white font-bold"
                : "bg-[#080808] border-[#222222] text-[#777777] hover:text-[#cccccc]"
            }`}
          >
            <span className="block font-bold text-[#4ade80]">Cloud Whisper (AI)</span>
            <span className="text-[10px] text-[#888888]">Auto OpenAI key • 0s setup</span>
          </button>

          <button
            type="button"
            onClick={() => onChange("stt_provider", "deepgram")}
            className={`p-2 text-left border transition-colors ${
              config.stt_provider === "deepgram"
                ? "bg-[#1c1c1c] border-white text-white font-bold"
                : "bg-[#080808] border-[#222222] text-[#777777] hover:text-[#cccccc]"
            }`}
          >
            <span className="block font-bold text-white">Deepgram Nova-2</span>
            <span className="text-[10px] text-[#888888]">Ultra-fast streaming</span>
          </button>

          <button
            type="button"
            onClick={() => onChange("stt_provider", "local_whisper")}
            className={`p-2 text-left border transition-colors ${
              config.stt_provider === "local_whisper"
                ? "bg-[#1c1c1c] border-white text-white font-bold"
                : "bg-[#080808] border-[#222222] text-[#777777] hover:text-[#cccccc]"
            }`}
          >
            <span className="block font-bold text-white">Local GGML Model</span>
            <span className="text-[10px] text-[#888888]">100% Offline download</span>
          </button>
        </div>

        {/* Cloud Whisper Status Banner */}
        {(config.stt_provider === "cloud_whisper" || config.stt_provider === "openai_whisper" || (!config.stt_provider && config.openai_api_key)) && (
          <div className="p-2.5 bg-[#0a180a] border border-[#1b381b] space-y-1 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-[#4ade80]">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>OpenAI Cloud Whisper is Active</span>
            </div>
            <p className="text-[#88cc88] text-[11px] leading-relaxed">
              Uses your active OpenAI API key from below or <code>.env</code>. No model download needed; transcribes instantly with zero CPU load.
            </p>
          </div>
        )}

        {/* Local Whisper Options */}
        {config.stt_provider === "local_whisper" && (
          <div className="p-2.5 bg-[#080808] border border-[#1c1c1c] space-y-2">
            <label className="block text-[#cccccc] font-bold text-xs uppercase">
              Whisper GGML Model Selection
            </label>
            <div className="space-y-1.5">
              {whisperModels.map((m) => {
                const isSelected = config.whisper_model_size === m.name;
                const isDownloading = downloadingModel === m.name;

                return (
                  <div
                    key={m.name}
                    className={`flex flex-col p-2 border transition-colors ${
                      isSelected
                        ? "bg-[#161616] border-[#333333] text-white"
                        : "bg-[#0c0c0c] border-[#181818] text-[#777777]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white uppercase text-xs">{m.name}</span>
                        <span className="text-[#555555] text-[11px]">({m.size})</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {isSelected && !isDownloading && (
                          <span className="flex items-center gap-1 text-[11px] text-[#4ade80] font-bold">
                            <CheckCircle className="w-3 h-3" />
                            <span>ACTIVE</span>
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDownloadWhisper(m.name)}
                          disabled={isDownloading}
                          className="flex items-center gap-1 px-2.5 py-1 bg-[#222222] hover:bg-[#333333] text-white disabled:opacity-40 text-xs transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          <span>{isDownloading ? "DOWNLOADING..." : "SELECT / GET"}</span>
                        </button>
                      </div>
                    </div>

                    {isDownloading && (
                      <div className="mt-2 space-y-1">
                        <div className="w-full h-1.5 bg-[#222222] overflow-hidden">
                          <div
                            className="h-full bg-[#38bdf8] transition-all duration-300"
                            style={{ width: `${Math.max(5, downloadProgress)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-[#888888]">
                          Downloading model weights from HuggingFace...
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {downloadSuccess && (
              <p className="text-xs text-[#4ade80] mt-1 font-bold">{downloadSuccess}</p>
            )}
          </div>
        )}

        {/* Deepgram Options */}
        {config.stt_provider === "deepgram" && (
          <div className="p-2.5 bg-[#080808] border border-[#1c1c1c] space-y-1.5">
            <label className="flex items-center gap-2 font-bold text-white uppercase">
              <Key className="w-3.5 h-3.5 text-[#facc15]" />
              <span>Deepgram API Key</span>
            </label>
            <input
              type="password"
              value={config.deepgram_api_key}
              onChange={(e) => onChange("deepgram_api_key", e.target.value)}
              placeholder="dg_..."
              className="w-full px-3 py-1.5 bg-[#0e0e0e] border border-[#222222] text-white text-xs focus:outline-none focus:border-[#444444]"
            />
          </div>
        )}
      </div>

      {/* --- LLM Provider Section --- */}
      <div className="p-3 bg-[#121212] border border-[#1f1f1f] space-y-2.5 font-mono text-xs">
        <h4 className="flex items-center gap-2 font-bold text-white uppercase">
          <Cloud className="w-3.5 h-3.5 text-[#c084fc]" />
          <span>LLM Provider & Engine</span>
        </h4>

        {/* Provider Switcher */}
        <div className="grid grid-cols-4 gap-1.5">
          {(["ollama", "openai", "anthropic", "groq"] as const).map((prov) => (
            <button
              key={prov}
              type="button"
              onClick={() => onChange("llm_provider", prov)}
              className={`py-1.5 px-2 border text-center font-bold text-xs uppercase transition-colors ${
                config.llm_provider === prov
                  ? "bg-[#1c1c1c] border-white text-white"
                  : "bg-[#080808] border-[#222222] text-[#777777] hover:text-[#cccccc]"
              }`}
            >
              {prov}
            </button>
          ))}
        </div>

        {/* Ollama Local Settings */}
        {config.llm_provider === "ollama" && (
          <div className="p-2.5 bg-[#080808] border border-[#1c1c1c] space-y-2">
            <div>
              <label className="flex items-center gap-2 font-bold text-white mb-1 uppercase">
                <Server className="w-3 h-3 text-[#38bdf8]" />
                <span>Ollama Endpoint URL</span>
              </label>
              <input
                type="text"
                value={config.ollama_endpoint}
                onChange={(e) => onChange("ollama_endpoint", e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full px-3 py-1.5 bg-[#0e0e0e] border border-[#222222] text-white text-xs focus:outline-none focus:border-[#444444]"
              />
            </div>
            <div>
              <label className="block font-bold text-white mb-1 uppercase">
                Ollama Model Name
              </label>
              <input
                type="text"
                value={config.ollama_model}
                onChange={(e) => onChange("ollama_model", e.target.value)}
                placeholder="llama3.2, mistral-nemo, deepseek-r1:8b"
                className="w-full px-3 py-1.5 bg-[#0e0e0e] border border-[#222222] text-white text-xs focus:outline-none focus:border-[#444444]"
              />
            </div>
          </div>
        )}

        {/* Cloud LLM Settings */}
        {config.llm_provider !== "ollama" && (
          <div className="p-2.5 bg-[#080808] border border-[#1c1c1c] space-y-2">
            <div>
              <label className="flex items-center gap-2 font-bold text-white mb-1 uppercase">
                <Key className="w-3.5 h-3.5 text-[#facc15]" />
                <span>
                  {config.llm_provider === "openai"
                    ? "OpenAI"
                    : config.llm_provider === "anthropic"
                    ? "Anthropic"
                    : "Groq"}{" "}
                  API Key
                </span>
              </label>
              <input
                type="password"
                value={
                  config.llm_provider === "openai"
                    ? config.openai_api_key
                    : config.llm_provider === "anthropic"
                    ? config.anthropic_api_key
                    : config.openai_api_key
                }
                onChange={(e) => {
                  if (config.llm_provider === "openai" || config.llm_provider === "groq") {
                    onChange("openai_api_key", e.target.value);
                  } else {
                    onChange("anthropic_api_key", e.target.value);
                  }
                }}
                placeholder="sk-... or gsk_... (or leave in .env)"
                className="w-full px-3 py-1.5 bg-[#0e0e0e] border border-[#222222] text-white text-xs focus:outline-none focus:border-[#444444]"
              />
            </div>

            <div>
              <label className="block font-bold text-white mb-1 uppercase">
                Model Name
              </label>
              <input
                type="text"
                value={
                  config.llm_provider === "openai"
                    ? config.openai_model
                    : config.llm_provider === "anthropic"
                    ? config.anthropic_model
                    : config.openai_model || "llama-3.3-70b-versatile"
                }
                onChange={(e) => {
                  if (config.llm_provider === "openai" || config.llm_provider === "groq") {
                    onChange("openai_model", e.target.value);
                  } else {
                    onChange("anthropic_model", e.target.value);
                  }
                }}
                placeholder="gpt-4o-mini, claude-3-5-sonnet-20241022, llama-3.3-70b-versatile"
                className="w-full px-3 py-1.5 bg-[#0e0e0e] border border-[#222222] text-white text-xs focus:outline-none focus:border-[#444444]"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
