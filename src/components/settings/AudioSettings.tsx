import React, { useEffect, useState } from "react";
import { Mic, Volume2, Sliders, Zap, RefreshCw } from "lucide-react";
import { AppConfig } from "../../types/config";
import { AudioDeviceInfo } from "../../types/audio";
import { TauriApi } from "../../services/tauriApi";

interface AudioSettingsProps {
  config: AppConfig;
  onChange: (key: keyof AppConfig, value: any) => void;
}

export const AudioSettings: React.FC<AudioSettingsProps> = ({ config, onChange }) => {
  const [inputDevices, setInputDevices] = useState<AudioDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<AudioDeviceInfo[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);

  const fetchDevices = async () => {
    setIsLoadingDevices(true);
    try {
      const res = await TauriApi.getAudioDevices();
      setInputDevices(res.inputs || []);
      setOutputDevices(res.outputs || []);
    } catch (err) {
      console.error("Failed to load audio devices:", err);
    } finally {
      setIsLoadingDevices(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-300">Audio Hardware & Endpoints</span>
        <button
          type="button"
          onClick={fetchDevices}
          disabled={isLoadingDevices}
          className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${isLoadingDevices ? "animate-spin" : ""}`} />
          <span>Refresh Devices</span>
        </button>
      </div>

      {/* Input Device */}
      <div>
        <label className="flex items-center gap-1.5 font-medium text-slate-200 mb-1">
          <Mic className="w-3.5 h-3.5 text-emerald-400" />
          <span>Candidate Microphone (Input Device)</span>
        </label>
        <select
          value={config.audio_input_device || ""}
          onChange={(e) => onChange("audio_input_device", e.target.value || null)}
          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-sky-500"
        >
          <option value="">Default System Microphone</option>
          {inputDevices.map((d) => (
            <option key={d.id} value={d.name}>
              {d.name} {d.is_default ? "(Default)" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Loopback Device */}
      <div>
        <label className="flex items-center gap-1.5 font-medium text-slate-200 mb-1">
          <Volume2 className="w-3.5 h-3.5 text-sky-400" />
          <span>Interviewer Stream (System Audio Loopback)</span>
        </label>
        <select
          value={config.audio_output_device || ""}
          onChange={(e) => onChange("audio_output_device", e.target.value || null)}
          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-sky-500"
        >
          <option value="">Default System Output (WASAPI Loopback)</option>
          {outputDevices.map((d) => (
            <option key={d.id} value={d.name}>
              {d.name} {d.is_default ? "(Default)" : ""}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-slate-500 mt-0.5">
          WASAPI Loopback captures what the interviewer says over Zoom, Teams, Google Meet, or browser.
        </p>
      </div>

      <div className="pt-2 border-t border-slate-800">
        <h4 className="flex items-center gap-1.5 font-semibold text-slate-300 mb-3">
          <Sliders className="w-3.5 h-3.5 text-yellow-400" />
          <span>Voice Activity Detection (VAD) Tuning</span>
        </h4>

        <div className="space-y-3">
          {/* VAD Sensitivity */}
          <div>
            <div className="flex justify-between text-slate-300 mb-1">
              <span>Speech Sensitivity Threshold</span>
              <span className="font-mono text-sky-400">{Math.round(config.vad_sensitivity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.05"
              value={config.vad_sensitivity}
              onChange={(e) => onChange("vad_sensitivity", parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-lg accent-sky-400 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
              <span>High Sensitivity (Picks up quiet speech)</span>
              <span>Low Sensitivity (Ignores noise)</span>
            </div>
          </div>

          {/* Silence Cutoff Duration */}
          <div>
            <div className="flex justify-between text-slate-300 mb-1">
              <span>Silence Cutoff Duration (End of Turn)</span>
              <span className="font-mono text-sky-400">{config.vad_silence_cutoff_ms} ms</span>
            </div>
            <input
              type="range"
              min="400"
              max="2000"
              step="100"
              value={config.vad_silence_cutoff_ms}
              onChange={(e) => onChange("vad_silence_cutoff_ms", parseInt(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-lg accent-sky-400 cursor-pointer"
            />
            <p className="text-[10px] text-slate-500 mt-0.5">
              How long silence must persist before finalizing a sentence and dispatching transcription.
            </p>
          </div>

          {/* Auto-Trigger Toggle */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              <div>
                <p className="font-medium text-slate-200">Auto-Trigger AI on Interviewer Question</p>
                <p className="text-[10px] text-slate-500">
                  Automatically generate hints when the interviewer completes a question turn.
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={config.auto_trigger_enabled}
              onChange={(e) => onChange("auto_trigger_enabled", e.target.checked)}
              className="w-4 h-4 rounded accent-sky-500 cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
