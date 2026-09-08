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
      className={`flex items-center gap-4 px-3.5 py-1.5 border-b text-xs select-none font-sans transition-colors ${
        isPaused ? "bg-amber-950/40 border-amber-900/50" : "bg-slate-900/90 border-slate-800"
      }`}
    >
      {isPaused && (
        <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded font-bold text-[10px] tracking-wider uppercase shrink-0">
          Audio & AI Paused
        </span>
      )}
      {/* Interviewer Loopback Stream */}
      <div className="flex-1 flex items-center gap-2.5">
        <button
          type="button"
          onClick={onToggleLoopbackMute}
          aria-label={loopbackMuted ? t.header.sysMuted : t.header.sysLive}
          className="flex items-center gap-1.5 text-slate-300 hover:text-white font-medium min-w-[95px] text-left transition-colors focus-visible:ring-1 focus-visible:ring-sky-400 rounded"
        >
          {loopbackMuted ? (
            <VolumeX className="w-3.5 h-3.5 text-rose-400" />
          ) : (
            <Volume2 className={`w-3.5 h-3.5 transition-colors ${loopbackActive ? "text-sky-400 animate-pulse" : "text-slate-400"}`} />
          )}
          <span className={loopbackMuted ? "text-rose-400 line-through" : loopbackActive ? "text-sky-300 font-bold" : "text-slate-200"}>
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
      <div className="flex-1 flex items-center gap-2.5">
        <button
          type="button"
          onClick={onToggleMicMute}
          aria-label={micMuted ? t.header.micMuted : t.header.micLive}
          className="flex items-center gap-1.5 text-slate-300 hover:text-white font-medium min-w-[55px] text-left transition-colors focus-visible:ring-1 focus-visible:ring-sky-400 rounded"
        >
          {micMuted ? (
            <MicOff className="w-3.5 h-3.5 text-rose-400" />
          ) : (
            <Mic className={`w-3.5 h-3.5 transition-colors ${micActive ? "text-emerald-400 animate-pulse" : "text-slate-400"}`} />
          )}
          <span className={micMuted ? "text-rose-400 line-through" : micActive ? "text-emerald-300 font-bold" : "text-slate-200"}>
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
          className="flex-1 h-2 bg-slate-950 border border-slate-700/80 rounded-full overflow-hidden"
        >
          <div
            className={`h-full transition-all duration-75 ease-out rounded-full ${
              micMuted
                ? "bg-transparent"
                : micActive
                ? "bg-emerald-400"
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
