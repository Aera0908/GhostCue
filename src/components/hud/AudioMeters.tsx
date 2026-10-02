import React from "react";
import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { useTranslation } from "../../i18n";

interface AudioMetersProps {
  micLevel: number;
  loopbackLevel: number;
  micActive: boolean;
  loopbackActive: boolean;
  sensitivity?: number;
  micMuted?: boolean;
  loopbackMuted?: boolean;
  onToggleMicMute?: () => void;
  onToggleLoopbackMute?: () => void;
  isPaused?: boolean;
}

export const AudioMeters: React.FC<AudioMetersProps> = ({
  micLevel,
  loopbackLevel,
  micActive,
  loopbackActive,
  sensitivity = 0.5,
  micMuted = false,
  loopbackMuted = false,
  onToggleMicMute,
  onToggleLoopbackMute,
  isPaused = false,
}) => {
  const { t } = useTranslation();
  const micPct = isPaused || micMuted ? 0 : Math.min(100, Math.max(micActive ? 8 : 0, Math.round(micLevel * 100)));
  const loopbackPct = isPaused || loopbackMuted ? 0 : Math.min(100, Math.max(loopbackActive ? 8 : 0, Math.round(loopbackLevel * 100)));

  return (
    <div
      role="region"
      aria-label="Audio stream activity and levels"
      className={`flex items-center gap-2.5 px-2.5 py-1 border-b text-xs select-none font-sans transition-colors ${
        isPaused ? "bg-amber-950/40 border-amber-900/50" : "bg-slate-900/90 border-slate-800"
      }`}
    >
      {isPaused && (
        <span
          title="Audio listening and AI suggestions are paused (Ctrl+Shift+P to resume)"
          className="px-1.5 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded font-bold text-[9px] tracking-wider uppercase shrink-0"
        >
          Paused
        </span>
      )}
      {/* Interviewer Loopback Stream */}
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={onToggleLoopbackMute}
          aria-label={loopbackMuted ? t.header.sysMuted : t.header.sysLive}
          className="flex items-center gap-1.5 text-slate-300 hover:text-white font-medium text-left transition-colors focus-visible:ring-1 focus-visible:ring-sky-400 rounded shrink-0"
        >
          {loopbackMuted ? (
            <VolumeX className="w-3.5 h-3.5 text-rose-400" />
          ) : (
            <Volume2 className={`w-3.5 h-3.5 transition-colors ${loopbackActive ? "text-sky-400 animate-pulse" : "text-slate-400"}`} />
          )}
          <span className={`text-xs truncate max-w-[80px] ${loopbackMuted ? "text-rose-400 line-through" : loopbackActive ? "text-sky-300 font-bold" : "text-slate-200"}`}>
            {t.transcript.speakerInterviewer}
          </span>
        </button>

        {/* Level Track */}
        <div
          role="meter"
          aria-label="Interviewer volume level"
          aria-valuenow={loopbackPct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="flex-1 h-2 bg-slate-950 border border-slate-700/80 rounded-full overflow-hidden"
        >
          <div
            className={`h-full transition-all duration-75 ease-out rounded-full ${
              loopbackMuted
                ? "bg-transparent"
                : loopbackActive
                ? "bg-sky-400"
                : "bg-sky-800/60"
            }`}
            style={{ width: `${loopbackPct}%` }}
          />
        </div>

        {/* Status Indicator */}
        <span
          className={`w-2 h-2 rounded-full transition-colors ${
            loopbackMuted
              ? "bg-rose-500"
              : loopbackActive
              ? "bg-sky-400 shadow-[0_0_8px_#38bdf8]"
              : "bg-slate-700"
          }`}
          title={loopbackMuted ? "Muted" : loopbackActive ? "Speaking" : "Silent"}
        />
      </div>

      {/* Divider */}
      <div className="h-3 w-[1px] bg-slate-700" />

      {/* Candidate Microphone Stream */}
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={onToggleMicMute}
          aria-label={micMuted ? t.header.micMuted : t.header.micLive}
          className="flex items-center gap-1.5 text-slate-300 hover:text-white font-medium text-left transition-colors focus-visible:ring-1 focus-visible:ring-sky-400 rounded shrink-0"
        >
          {micMuted ? (
            <MicOff className="w-3.5 h-3.5 text-rose-400" />
          ) : (
            <Mic className={`w-3.5 h-3.5 transition-colors ${micActive ? "text-emerald-400 animate-pulse" : "text-slate-400"}`} />
          )}
          <span className={`text-xs truncate max-w-[70px] ${micMuted ? "text-rose-400 line-through" : micActive ? "text-emerald-300 font-bold" : "text-slate-200"}`}>
            {t.transcript.speakerCandidate.split(" ")[0]}
          </span>
        </button>

        {/* Level Track */}
        <div
          role="meter"
          aria-label="Microphone volume level"
          aria-valuenow={micPct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="relative flex-1 h-2 bg-slate-950 border border-slate-700/80 rounded-full overflow-hidden"
        >
          {/* Pickup Sensitivity Threshold Marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-amber-400/80 z-10 shadow-[0_0_3px_#fbbf24]"
            style={{ left: `${Math.round(Math.max(8, Math.min(92, (1.0 - (sensitivity || 0.5)) * 80 + 10)))}%` }}
            title={`Voice Pickup Sensitivity Threshold: ${Math.round((sensitivity || 0.5) * 100)}%`}
          />
          <div
            className={`h-full transition-all duration-75 ease-out rounded-full ${
              micMuted
                ? "bg-transparent"
                : micActive
                ? "bg-emerald-400 shadow-[0_0_6px_#10b981]"
                : "bg-emerald-800/60"
            }`}
            style={{ width: `${micPct}%` }}
          />
        </div>

        {/* Status Indicator */}
        <span
          className={`w-2 h-2 rounded-full transition-colors ${
            micMuted
              ? "bg-rose-500"
              : micActive
              ? "bg-emerald-400 shadow-[0_0_8px_#10b981]"
              : "bg-slate-700"
          }`}
          title={micMuted ? "Mic Muted" : micActive ? "Speaking" : "Silent"}
        />
      </div>
    </div>
  );
};
