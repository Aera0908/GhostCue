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
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  useEffect(() => {
    TauriApi.getAvailableWhisperModels().then((models) => {
      setWhisperModels(models as WhisperModelInfo[]);
    });
  }, []);

  const handleDownloadWhisper = async (modelName: string) => {
    setDownloadingModel(modelName);
    setDownloadSuccess(null);

    try {
      const path = await TauriApi.downloadWhisperModel(modelName);
      onChange("whisper_model_path", path);
      onChange("whisper_model_size", modelName);
      setDownloadSuccess(`Model ${modelName} ready!`);
    } catch (err: any) {
      alert(`Failed to download model: ${err}`);
    } finally {
      setDownloadingModel(null);
    }
  };

  return (
    <div className="space-y-5 text-xs">
      {/* --- STT Provider Section --- */}
      <div>
        <h4 className="flex items-center gap-1.5 font-semibold text-slate-200 mb-2">
          <Cpu className="w-3.5 h-3.5 text-sky-400" />
          <span>Speech-to-Text (STT) Engine</span>
        </h4>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            type="button"
            onClick={() => onChange("stt_provider", "local_whisper")}
            className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition-all ${
              config.stt_provider === "local_whisper"
                ? "bg-sky-950/60 border-sky-500/60 text-sky-200 shadow-sm"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
            }`}
          >
            <span className="font-semibold text-xs text-slate-200">Local Whisper (GGML)</span>
            <span className="text-[10px] text-slate-400 mt-0.5">100% Offline & Private (whisper.cpp)</span>
          </button>

          <button
            type="button"
            onClick={() => onChange("stt_provider", "deepgram")}
            className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition-all ${
              config.stt_provider === "deepgram"
                ? "bg-sky-950/60 border-sky-500/60 text-sky-200 shadow-sm"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
            }`}
          >
            <span className="font-semibold text-xs text-slate-200">Deepgram Nova-2</span>
            <span className="text-[10px] text-slate-400 mt-0.5">Zero CPU Load & Real-Time Cloud</span>
          </button>
        </div>

        {/* Local Whisper Options */}
        {config.stt_provider === "local_whisper" && (
          <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg space-y-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Whisper GGML Model Selection</label>
              <div className="space-y-1.5">
                {whisperModels.map((m) => {
                  const isSelected = config.whisper_model_size === m.name;
                  const isDownloading = downloadingModel === m.name;

                  return (
                    <div
                      key={m.name}
                      className={`flex items-center justify-between p-2 rounded border text-[11px] ${
                        isSelected
                          ? "bg-sky-950/40 border-sky-500/40 text-slate-200"
                          : "bg-slate-950 border-slate-800/80 text-slate-400"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sky-400 uppercase">{m.name}</span>
                        <span className="text-slate-500">({m.size})</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {isSelected && !isDownloading && (
                          <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                            <CheckCircle className="w-3 h-3" />
                            <span>Active</span>
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDownloadWhisper(m.name)}
                          disabled={isDownloading}
                          className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-50 text-[10px]"
                        >
                          <Download className="w-2.5 h-2.5" />
                          <span>{isDownloading ? "Downloading..." : "Select / Get"}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {downloadSuccess && (
                <p className="text-[11px] text-emerald-400 mt-2 font-medium">{downloadSuccess}</p>
              )}
            </div>
          </div>
        )}

        {/* Deepgram Options */}
        {config.stt_provider === "deepgram" && (
          <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg space-y-2">
            <label className="flex items-center gap-1.5 font-medium text-slate-200">
              <Key className="w-3.5 h-3.5 text-yellow-400" />
              <span>Deepgram API Key</span>
            </label>
            <input
              type="password"
              value={config.deepgram_api_key}
              onChange={(e) => onChange("deepgram_api_key", e.target.value)}
              placeholder="dg_..."
              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-md text-slate-200 font-mono text-xs focus:outline-none focus:border-sky-500"
            />
          </div>
        )}
      </div>

      {/* --- LLM Provider Section --- */}
      <div className="pt-2 border-t border-slate-800">
        <h4 className="flex items-center gap-1.5 font-semibold text-slate-200 mb-2">
          <Cloud className="w-3.5 h-3.5 text-purple-400" />
          <span>LLM Provider & Generation Engine</span>
        </h4>

        {/* LLM Provider Tabs */}
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {(["ollama", "openai", "anthropic", "groq"] as const).map((prov) => (
            <button
              key={prov}
              type="button"
              onClick={() => onChange("llm_provider", prov)}
              className={`py-1.5 px-2 rounded-md border text-center font-medium text-xs capitalize transition-all ${
                config.llm_provider === prov
                  ? "bg-purple-950/60 border-purple-500/60 text-purple-200 shadow-sm"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
              }`}
            >
              {prov}
            </button>
          ))}
        </div>

        {/* Ollama Local Settings */}
        {config.llm_provider === "ollama" && (
          <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg space-y-3">
            <div>
              <label className="flex items-center gap-1 font-medium text-slate-300 mb-1">
                <Server className="w-3 h-3 text-sky-400" />
                <span>Ollama Endpoint URL</span>
              </label>
              <input
                type="text"
                value={config.ollama_endpoint}
                onChange={(e) => onChange("ollama_endpoint", e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-md text-slate-200 font-mono text-xs focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-300 mb-1">Ollama Model Name</label>
              <input
                type="text"
                value={config.ollama_model}
                onChange={(e) => onChange("ollama_model", e.target.value)}
                placeholder="llama3.2, mistral-nemo, deepseek-r1:8b"
                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-md text-slate-200 font-mono text-xs focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>
        )}

        {/* OpenAI / Groq / Anthropic Settings */}
        {config.llm_provider !== "ollama" && (
          <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg space-y-3">
            <div>
              <label className="flex items-center gap-1 font-medium text-slate-300 mb-1">
                <Key className="w-3 h-3 text-yellow-400" />
                <span>
                  {config.llm_provider === "openai" ? "OpenAI" : config.llm_provider === "anthropic" ? "Anthropic" : "Groq"} API Key
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
                placeholder="sk-..."
                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-md text-slate-200 font-mono text-xs focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-300 mb-1">Model Name</label>
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
                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-md text-slate-200 font-mono text-xs focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
