import React from "react";
import { Mic, Volume2 } from "lucide-react";

interface AudioMetersProps {
  micLevel: number;
  loopbackLevel: number;
  micActive: boolean;
  loopbackActive: boolean;
  sensitivity: number;
}

export const AudioMeters: React.FC<AudioMetersProps> = ({
  micLevel,
  loopbackLevel,
  micActive,
  loopbackActive,
  sensitivity,
}) => {
  // Clamp levels between 0 and 1
  const micPct = Math.min(100, Math.max(0, micLevel * 100));
  const loopbackPct = Math.min(100, Math.max(0, loopbackLevel * 100));
  const thresholdPct = Math.min(100, Math.max(0, sensitivity * 100));

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-950/60 border-b border-white/5 text-[11px]">
      {/* Interviewer System Loopback Meter */}
      <div className="flex-1 flex items-center gap-2">
        <div className="flex items-center gap-1 text-sky-400 font-medium min-w-[75px]">
          <Volume2 className="w-3.5 h-3.5" />
          <span>Interviewer</span>
        </div>

        {/* Meter Bar Container */}
        <div className="relative flex-1 h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
          {/* Threshold Marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-yellow-500/80 z-10"
            style={{ left: `${thresholdPct}%` }}
            title={`VAD Threshold: ${Math.round(thresholdPct)}%`}
          />
          {/* Active Level Bar */}
          <div
            className="h-full bg-gradient-to-r from-sky-500 to-cyan-300 transition-all duration-75 ease-out rounded-full"
            style={{ width: `${loopbackPct}%` }}
          />
        </div>

        {/* VAD Speech Bulb */}
        <span
          className={`w-2 h-2 rounded-full transition-all duration-150 ${
            loopbackActive
              ? "bg-cyan-400 shadow-[0_0_8px_#38bdf8] scale-110"
              : "bg-slate-700"
          }`}
          title={loopbackActive ? "Interviewer Speaking" : "Interviewer Silent"}
        />
      </div>

      {/* Vertical divider */}
      <div className="h-4 w-px bg-slate-800" />

      {/* Candidate Microphone Meter */}
      <div className="flex-1 flex items-center gap-2">
        <div className="flex items-center gap-1 text-emerald-400 font-medium min-w-[75px]">
          <Mic className="w-3.5 h-3.5" />
          <span>Candidate</span>
        </div>

        {/* Meter Bar Container */}
        <div className="relative flex-1 h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
          {/* Threshold Marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-yellow-500/80 z-10"
            style={{ left: `${thresholdPct}%` }}
            title={`VAD Threshold: ${Math.round(thresholdPct)}%`}
          />
          {/* Active Level Bar */}
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-300 transition-all duration-75 ease-out rounded-full"
            style={{ width: `${micPct}%` }}
          />
        </div>

        {/* VAD Speech Bulb */}
        <span
          className={`w-2 h-2 rounded-full transition-all duration-150 ${
            micActive
              ? "bg-emerald-400 shadow-[0_0_8px_#10b981] scale-110"
              : "bg-slate-700"
          }`}
          title={micActive ? "Candidate Speaking" : "Candidate Silent"}
        />
      </div>
    </div>
  );
};
