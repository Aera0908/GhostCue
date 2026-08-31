import React, { useEffect, useState } from "react";
import { Mic, Volume2, Sliders, Zap, RefreshCw, Play, CheckCircle2, AlertTriangle, HelpCircle } from "lucide-react";
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

    // Ensure audio capture is running in backend
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

    // High-rate polling fallback to guarantee real-time updates across all webviews
    const pollInterval = setInterval(async () => {
      try {
        const lv = await TauriApi.getAudioLevels();
        setLiveMicLevel(lv.mic_level);
        setLiveMicActive(lv.mic_active);
        setLiveLoopbackLevel(lv.loopback_level);
        setLiveLoopbackActive(lv.loopback_active);
      } catch (_) {}
    }, 50);

    // Browser WebAudio fallback when testing in standard web browser
    let browserStream: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;
    let animFrame: number | null = null;

    if (typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window)) {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => {
            browserStream = stream;
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            audioCtx = new AudioCtx();
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            const data = new Uint8Array(analyser.frequencyBinCount);

            const loop = () => {
              analyser.getByteTimeDomainData(data);
              let maxVal = 0;
              for (let i = 0; i < data.length; i++) {
                const val = Math.abs(data[i] - 128);
                if (val > maxVal) maxVal = val;
              }
              const level = Math.min(1.0, (maxVal / 128.0) * 3.5);
              setLiveMicLevel(level);
              setLiveMicActive(level > 0.05);
              animFrame = requestAnimationFrame(loop);
            };
            loop();
          })
          .catch(console.warn);
      }
    }

    return () => {
      if (unlistenMic) unlistenMic();
      if (unlistenLoopback) unlistenLoopback();
      clearInterval(pollInterval);
      if (animFrame) cancelAnimationFrame(animFrame);
      if (browserStream) browserStream.getTracks().forEach((t) => t.stop());
      if (audioCtx && (audioCtx as AudioContext).state !== "closed") {
        (audioCtx as AudioContext).close().catch(() => {});
      }
    };
  }, []);

  // Web Audio test sound to verify real loopback capture via physical speaker output
  const handlePlayTestSound = () => {
    try {
      setIsPlayingTestSound(true);
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      if (audioCtx.state === "suspended") {
        audioCtx.resume();
      }

      // Play 3-tone chime through speakers
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.2); // E5
      osc.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.4); // G5

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

  // Immediate hot-swap when device changes
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
      {/* --- 1. Live Hardware Audio Test Station --- */}
      <div className="p-3.5 bg-[#111111] border border-[#2a2a2a] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#4ade80] animate-pulse" />
            <span className="font-bold text-white text-xs">Live Audio Hardware Monitor</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#142814] text-[#4ade80]">
              WASAPI Engine Active
            </span>
            <button
              type="button"
              onClick={() => setShowTroubleshoot(!showTroubleshoot)}
              className="text-[11px] text-[#888888] hover:text-white flex items-center gap-1"
            >
              <HelpCircle className="w-3 h-3" />
              <span>Help</span>
            </button>
          </div>
        </div>

        {/* Live Microphone Test Bar */}
        <div className="p-3 bg-[#0a0a0a] border border-[#222222] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-white font-semibold">
              <Mic className="w-3.5 h-3.5 text-[#4ade80]" />
              <span>Microphone Input (You)</span>
              {config.audio_input_device && (
                <span className="text-[10px] text-[#888888] font-mono truncate max-w-[180px] hidden sm:inline">
                  [{config.audio_input_device}]
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-white text-xs font-bold">{micPct}%</span>
              {liveMicActive ? (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-[#163016] text-[#4ade80] text-[11px] font-bold border border-[#265026]">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>VOICE ACTIVE</span>
                </span>
              ) : (
                <span className="text-[10px] text-[#777777] font-mono px-1.5 py-0.5 bg-[#161616]">
                  Ready / Listening
                </span>
              )}
            </div>
          </div>

          {/* Level Meter Track */}
          <div className="w-full h-2.5 bg-[#1c1c1c] overflow-hidden">
            <div
              className={`h-full transition-all duration-75 ease-out ${
                liveMicActive ? "bg-[#4ade80]" : "bg-[#258045]"
              }`}
              style={{ width: `${Math.max(2, micPct)}%` }}
            />
          </div>
        </div>

        {/* Live Loopback (Interviewer Voice) Test Bar */}
        <div className="p-3 bg-[#0a0a0a] border border-[#222222] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-white font-semibold">
              <Volume2 className="w-3.5 h-3.5 text-[#38bdf8]" />
              <span>Interviewer / System Sound (Loopback)</span>
              {config.audio_output_device && (
                <span className="text-[10px] text-[#888888] font-mono truncate max-w-[180px] hidden sm:inline">
                  [{config.audio_output_device}]
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-white text-xs font-bold">{loopbackPct}%</span>
              {liveLoopbackActive ? (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-[#14283c] text-[#38bdf8] text-[11px] font-bold border border-[#1f4060]">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>AUDIO ACTIVE</span>
                </span>
              ) : (
                <span className="text-[10px] text-[#777777] font-mono px-1.5 py-0.5 bg-[#161616]">
                  Ready / Listening
                </span>
              )}
            </div>
          </div>

          {/* Level Meter Track */}
          <div className="w-full h-2.5 bg-[#1c1c1c] overflow-hidden">
            <div
              className={`h-full transition-all duration-75 ease-out ${
                liveLoopbackActive ? "bg-[#38bdf8]" : "bg-[#226a90]"
              }`}
              style={{ width: `${Math.max(2, loopbackPct)}%` }}
            />
          </div>

          {/* Play Test Tone Button */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-[#777777]">
              Play audio through your speakers to test interviewer capture
            </span>
            <button
              type="button"
              onClick={handlePlayTestSound}
              disabled={isPlayingTestSound}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e1e1e] hover:bg-[#2c2c2c] text-[#38bdf8] hover:text-white border border-[#383838] transition-colors font-medium"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>{isPlayingTestSound ? "Playing Test Chime..." : "Play Test Chime"}</span>
            </button>
          </div>
        </div>

        {/* Troubleshooting Info Box */}
        {showTroubleshoot && (
          <div className="p-3 bg-[#181818] border border-[#333333] space-y-2 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-white">
              <AlertTriangle className="w-4 h-4 text-[#facc15]" />
              <span>Windows Microphone & Speaker Selection Tips</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-[#cccccc] leading-relaxed">
              <li>Select your real physical microphone below (e.g. <strong>Microphone (M-830)</strong> or <strong>Usb Audio Device</strong>) instead of virtual ones.</li>
              <li>Select your real physical headphones/speakers below (e.g. <strong>Earbuds (Realtek)</strong> or <strong>Speakers</strong>) instead of FxSound.</li>
              <li>Make sure <strong>"Let desktop apps access your microphone"</strong> is turned ON in Windows Privacy Settings.</li>
            </ol>
          </div>
        )}
      </div>

      {/* --- 2. Device Selection --- */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-white">Audio Endpoints</span>
          <button
            type="button"
            onClick={fetchDevices}
            disabled={isLoadingDevices}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1c1c1c] hover:bg-[#282828] text-[#cccccc] hover:text-white transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${isLoadingDevices ? "animate-spin" : ""}`} />
            <span>Refresh Devices</span>
          </button>
        </div>

        {/* Input Device Dropdown */}
        <div className="p-3 bg-[#141414] border border-[#222222] space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 font-semibold text-white">
              <Mic className="w-3.5 h-3.5 text-[#4ade80]" />
              <span>Microphone Input Device</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[#888888] cursor-pointer">
              <input
                type="checkbox"
                checked={config.mic_enabled}
                onChange={(e) => handleDeviceChange("mic_enabled", e.target.checked)}
                className="accent-[#4ade80]"
              />
              <span>Enabled</span>
            </label>
          </div>

          <select
            value={config.audio_input_device || ""}
            onChange={(e) => handleDeviceChange("audio_input_device", e.target.value || null)}
            className="w-full px-3 py-2 bg-[#0c0c0c] border border-[#2a2a2a] text-[#eeeeee] focus:outline-none focus:border-[#555555] cursor-pointer font-medium"
          >
            <option value="">Auto-Select Default</option>
            {inputDevices.map((d) => (
              <option key={d.id} value={d.name}>
                {d.name} {d.is_default ? "(Windows Default)" : ""}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-[#777777]">
            Select your physical microphone (e.g. <strong>Microphone (M-830)</strong>, <strong>Realtek</strong>, or <strong>USB Audio</strong>) to avoid disconnected virtual devices.
          </p>
        </div>

        {/* Loopback Device Dropdown */}
        <div className="p-3 bg-[#141414] border border-[#222222] space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 font-semibold text-white">
              <Volume2 className="w-3.5 h-3.5 text-[#38bdf8]" />
              <span>Interviewer Loopback Speaker (Where you hear sound)</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[#888888] cursor-pointer">
              <input
                type="checkbox"
                checked={config.loopback_enabled}
                onChange={(e) => handleDeviceChange("loopback_enabled", e.target.checked)}
                className="accent-[#38bdf8]"
              />
              <span>Enabled</span>
            </label>
          </div>

          <select
            value={config.audio_output_device || ""}
            onChange={(e) => handleDeviceChange("audio_output_device", e.target.value || null)}
            className="w-full px-3 py-2 bg-[#0c0c0c] border border-[#2a2a2a] text-[#eeeeee] focus:outline-none focus:border-[#555555] cursor-pointer font-medium"
          >
            <option value="">Auto-Select Default</option>
            {outputDevices.map((d) => (
              <option key={d.id} value={d.name}>
                {d.name} {d.is_default ? "(Windows Default)" : ""}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-[#777777]">
            Select the speaker or headphones you are wearing (e.g. <strong>Earbuds (Realtek)</strong> or <strong>Speakers</strong>) to capture interviewer audio.
          </p>
        </div>
      </div>

      {/* --- 3. Voice Sensitivity Tuning --- */}
      <div className="p-3 bg-[#141414] border border-[#222222] space-y-3">
        <h4 className="flex items-center gap-2 font-semibold text-white">
          <Sliders className="w-3.5 h-3.5 text-[#facc15]" />
          <span>Speech Detection Sensitivity</span>
        </h4>

        {/* Sensitivity Slider */}
        <div className="space-y-1">
          <div className="flex justify-between text-[#cccccc]">
            <span>Voice Pickup Sensitivity</span>
            <span className="text-white font-bold">{Math.round(config.vad_sensitivity * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="0.9"
            step="0.05"
            value={config.vad_sensitivity}
            onChange={(e) => handleDeviceChange("vad_sensitivity", parseFloat(e.target.value))}
            className="w-full h-1.5 bg-[#0c0c0c] accent-white cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-[#666666]">
            <span>Higher (picks up quiet whispers)</span>
            <span>Lower (filters room noise)</span>
          </div>
        </div>

        {/* Silence Cutoff Delay */}
        <div className="space-y-1">
          <div className="flex justify-between text-[#cccccc]">
            <span>Sentence Pause Timeout</span>
            <span className="text-white font-bold">{config.vad_silence_cutoff_ms} ms</span>
          </div>
          <input
            type="range"
            min="400"
            max="2000"
            step="100"
            value={config.vad_silence_cutoff_ms}
            onChange={(e) => handleDeviceChange("vad_silence_cutoff_ms", parseInt(e.target.value))}
            className="w-full h-1.5 bg-[#0c0c0c] accent-white cursor-pointer"
          />
        </div>

        {/* Auto Trigger Toggle */}
        <div className="flex items-center justify-between p-2 bg-[#0c0c0c] border border-[#222222]">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-[#facc15]" />
            <div>
              <p className="font-semibold text-white">Auto-Answer on Question</p>
              <p className="text-[11px] text-[#666666]">
                Automatically suggest an answer when interviewer finishes speaking
              </p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={config.auto_trigger_enabled}
            onChange={(e) => handleDeviceChange("auto_trigger_enabled", e.target.checked)}
            className="w-4 h-4 accent-white cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};
