import React, { useEffect, useState } from "react";
import { Mic, Volume2, Sliders, Zap, RefreshCw, Play, CheckCircle2, AlertTriangle, HelpCircle } from "lucide-react";
import { AppConfig } from "../../types/config";
import { AudioDeviceInfo } from "../../types/audio";
import { TauriApi } from "../../services/tauriApi";

interface AudioSettingsProps {
  config: AppConfig;
  onChange: (key: keyof AppConfig, value: any) => void;
  inLiveHud?: boolean;
}

export const AudioSettings: React.FC<AudioSettingsProps> = ({ config, onChange, inLiveHud = false }) => {
  const [inputDevices, setInputDevices] = useState<AudioDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<AudioDeviceInfo[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);

  // Live Audio Testing Levels
  const [liveMicLevel, setLiveMicLevel] = useState<number>(0);
  const [liveMicActive, setLiveMicActive] = useState<boolean>(false);
  const [liveLoopbackLevel, setLiveLoopbackLevel] = useState<number>(0);
  const [liveLoopbackActive, setLiveLoopbackActive] = useState<boolean>(false);
  const [isPlayingTestSound, setIsPlayingTestSound] = useState(false);
  const [showTroubleshoot, setShowTroubleshoot] = useState<boolean>(false);

  const fetchDevices = async () => {
    setIsLoadingDevices(true);
    try {
      const res = await TauriApi.getAudioDevices();
      const inputs = res.inputs || [];
      const outputs = res.outputs || [];
      setInputDevices(inputs);
      setOutputDevices(outputs);
    } catch (err) {
      console.error("Failed to load audio devices:", err);
    } finally {
      setIsLoadingDevices(false);
    }
  };

  useEffect(() => {
    fetchDevices();
    TauriApi.startAudioCapture().catch(console.warn);

    let unlistenMic: (() => void) | undefined;
    let unlistenLoopback: (() => void) | undefined;

    TauriApi.onMicLevel((ev) => {
      setLiveMicLevel(ev.level);
      setLiveMicActive(ev.active);
    }).then((u) => (unlistenMic = u));

    TauriApi.onLoopbackLevel((ev) => {
      setLiveLoopbackLevel(ev.level);
      setLiveLoopbackActive(ev.active);
    }).then((u) => (unlistenLoopback = u));

    const pollInterval = setInterval(async () => {
      try {
        const lv = await TauriApi.getAudioLevels();
        setLiveMicLevel(lv.mic_level);
        setLiveMicActive(lv.mic_active);
        setLiveLoopbackLevel(lv.loopback_level);
        setLiveLoopbackActive(lv.loopback_active);
      } catch (_) {}
    }, 50);

    return () => {
      if (unlistenMic) unlistenMic();
      if (unlistenLoopback) unlistenLoopback();
      clearInterval(pollInterval);
      if (!inLiveHud) {
        TauriApi.stopAudioCapture().catch(console.warn);
      }
    };
  }, [inLiveHud]);

  const handlePlayTestSound = () => {
    try {
      setIsPlayingTestSound(true);
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      if (audioCtx.state === "suspended") {
        audioCtx.resume();
      }

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime);
      osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.2);
      osc.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.4);

      gain.gain.setValueAtTime(0.6, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.85);

      setTimeout(() => {
        setIsPlayingTestSound(false);
        if (audioCtx.state !== "closed") {
          audioCtx.close().catch(() => {});
        }
      }, 950);
    } catch (e) {
      console.warn("Could not play test tone:", e);
      setIsPlayingTestSound(false);
    }
  };

  const handleDeviceChange = async (key: keyof AppConfig, value: any) => {
    onChange(key, value);
    const updatedConfig = { ...config, [key]: value };
    await TauriApi.saveConfig(updatedConfig);

    try {
      await TauriApi.stopAudioCapture();
      await TauriApi.startAudioCapture();
    } catch (e) {
      console.warn("Device hot-swap error:", e);
    }
  };

  const micPct = Math.min(100, Math.max(liveMicActive ? 6 : 0, Math.round(liveMicLevel * 100)));
  const loopbackPct = Math.min(100, Math.max(liveLoopbackActive ? 6 : 0, Math.round(liveLoopbackLevel * 100)));

  return (
    <div className="space-y-4 text-xs font-sans">
      {/* 1. Live Hardware Audio Test Station */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981] animate-pulse" />
            <span className="font-bold text-slate-100 text-xs">Live Audio Hardware Monitor</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono px-2 py-0.5 bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 rounded">
              WASAPI Engine Active
            </span>
            <button
              type="button"
              onClick={() => setShowTroubleshoot(!showTroubleshoot)}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Help</span>
            </button>
          </div>
        </div>

        {/* Live Mic Bar */}
        <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-slate-100 font-semibold">
              <Mic className="w-3.5 h-3.5 text-emerald-400" />
              <span>Microphone Input (You)</span>
              {config.audio_input_device && (
                <span className="text-[10px] text-slate-400 font-mono truncate max-w-[180px] hidden sm:inline">
                  [{config.audio_input_device}]
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-slate-100 text-xs font-bold">{micPct}%</span>
              {liveMicActive ? (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-950 border border-emerald-500/50 text-emerald-300 text-[11px] font-bold rounded">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>VOICE ACTIVE</span>
                </span>
              ) : (
                <span className="text-[10px] text-slate-400 font-mono px-2 py-0.5 bg-slate-900 border border-slate-800 rounded">
                  Ready / Listening
                </span>
              )}
            </div>
          </div>

          <div className="w-full h-2.5 bg-slate-900 border border-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-75 ease-out rounded-full ${
                liveMicActive ? "bg-emerald-400" : "bg-emerald-800/60"
              }`}
              style={{ width: `${Math.max(2, micPct)}%` }}
            />
          </div>
        </div>

        {/* Live Loopback Bar */}
        <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-slate-100 font-semibold">
              <Volume2 className="w-3.5 h-3.5 text-sky-400" />
              <span>Interviewer / System Loopback (Speaker Output)</span>
              {config.audio_output_device && (
                <span className="text-[10px] text-slate-400 font-mono truncate max-w-[180px] hidden sm:inline">
                  [{config.audio_output_device}]
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-slate-100 text-xs font-bold">{loopbackPct}%</span>
              {liveLoopbackActive ? (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-sky-950 border border-sky-500/50 text-sky-300 text-[11px] font-bold rounded">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>AUDIO ACTIVE</span>
                </span>
              ) : (
                <span className="text-[10px] text-slate-400 font-mono px-2 py-0.5 bg-slate-900 border border-slate-800 rounded">
                  Ready / Listening
                </span>
              )}
            </div>
          </div>

          <div className="w-full h-2.5 bg-slate-900 border border-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-75 ease-out rounded-full ${
                liveLoopbackActive ? "bg-sky-400" : "bg-sky-800/60"
              }`}
              style={{ width: `${Math.max(2, loopbackPct)}%` }}
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-400">
              Play audio through your speakers to test loopback capture
            </span>
            <button
              type="button"
              onClick={handlePlayTestSound}
              disabled={isPlayingTestSound}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-white border border-slate-700 rounded-lg transition-colors font-semibold"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isPlayingTestSound ? "Playing Chime..." : "Play Test Tone"}</span>
            </button>
          </div>
        </div>

        {showTroubleshoot && (
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-2 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-slate-100">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Audio Configuration Tips</span>
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-300 leading-relaxed">
              <li>Select your actual physical microphone below (e.g. <strong>Realtek Audio</strong> or <strong>USB Mic</strong>).</li>
              <li>Select the headphones or speakers you use to listen to the interview call.</li>
              <li>Ensure <strong>"Let desktop apps access your microphone"</strong> is enabled in Windows Privacy Settings.</li>
            </ol>
          </div>
        )}
      </div>

      {/* 2. Device Selection */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-100">Hardware Audio Endpoints</span>
          <button
            type="button"
            onClick={fetchDevices}
            disabled={isLoadingDevices}
            className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 rounded-lg transition-colors font-medium"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDevices ? "animate-spin text-sky-400" : ""}`} />
            <span>Refresh Devices</span>
          </button>
        </div>

        {/* Input Device */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 font-semibold text-slate-100">
              <Mic className="w-4 h-4 text-emerald-400" />
              <span>Microphone Input Device</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={config.mic_enabled}
                onChange={(e) => handleDeviceChange("mic_enabled", e.target.checked)}
                className="accent-emerald-400 w-3.5 h-3.5"
              />
              <span>Enabled</span>
            </label>
          </div>

          <select
            value={config.audio_input_device || ""}
            onChange={(e) => handleDeviceChange("audio_input_device", e.target.value || null)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-sky-400 cursor-pointer font-medium"
          >
            <option value="">Auto-Select Default</option>
            {inputDevices.map((d) => (
              <option key={d.id} value={d.name}>
                {d.name} {d.is_default ? "(Windows Default)" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Loopback Device */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 font-semibold text-slate-100">
              <Volume2 className="w-4 h-4 text-sky-400" />
              <span>Interviewer Loopback Speaker</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={config.loopback_enabled}
                onChange={(e) => handleDeviceChange("loopback_enabled", e.target.checked)}
                className="accent-sky-400 w-3.5 h-3.5"
              />
              <span>Enabled</span>
            </label>
          </div>

          <select
            value={config.audio_output_device || ""}
            onChange={(e) => handleDeviceChange("audio_output_device", e.target.value || null)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-sky-400 cursor-pointer font-medium"
          >
            <option value="">Auto-Select Default</option>
            {outputDevices.map((d) => (
              <option key={d.id} value={d.name}>
                {d.name} {d.is_default ? "(Windows Default)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 3. VAD Sensitivity */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3.5">
        <h4 className="flex items-center gap-2 font-semibold text-slate-100">
          <Sliders className="w-4 h-4 text-amber-400" />
          <span>Speech Detection Sensitivity (VAD)</span>
        </h4>

        <div className="space-y-1.5">
          <div className="flex justify-between text-slate-300">
            <span>Voice Pickup Sensitivity</span>
            <span className="text-slate-100 font-bold">{Math.round(config.vad_sensitivity * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="0.9"
            step="0.05"
            value={config.vad_sensitivity}
            onChange={(e) => handleDeviceChange("vad_sensitivity", parseFloat(e.target.value))}
            className="w-full h-2 bg-slate-950 accent-sky-400 rounded cursor-pointer"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-slate-300">
            <span>Sentence Pause Silence Cutoff</span>
            <span className="text-slate-100 font-bold">{config.vad_silence_cutoff_ms} ms</span>
          </div>
          <input
            type="range"
            min="400"
            max="3000"
            step="100"
            value={config.vad_silence_cutoff_ms}
            onChange={(e) => handleDeviceChange("vad_silence_cutoff_ms", parseInt(e.target.value))}
            className="w-full h-2 bg-slate-950 accent-sky-400 rounded cursor-pointer"
          />
        </div>

        <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-lg">
          <div className="flex items-center gap-2.5">
            <Zap className="w-4 h-4 text-amber-400" />
            <div>
              <p className="font-semibold text-slate-100">Auto-Answer on Question</p>
              <p className="text-[11px] text-slate-400">
                Automatically triggers answer when interviewer completes a question
              </p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={config.auto_trigger_enabled}
            onChange={(e) => handleDeviceChange("auto_trigger_enabled", e.target.checked)}
            className="w-4 h-4 accent-sky-400 cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};
