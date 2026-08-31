import React from "react";
import { Mic, Volume2 } from "lucide-react";

interface AudioMetersProps {
  micLevel: number;
  loopbackLevel: number;
  micActive: boolean;
  loopbackActive: boolean;
  sensitivity: number;
  bgOpacity?: number;
}

export const AudioMeters: React.FC<AudioMetersProps> = ({
  micLevel,
  loopbackLevel,
  micActive,
  loopbackActive,
  bgOpacity = 0.94,
}) => {
  const micPct = Math.min(100, Math.max(micActive ? 6 : 0, Math.round(micLevel * 100)));
  const loopbackPct = Math.min(100, Math.max(loopbackActive ? 6 : 0, Math.round(loopbackLevel * 100)));

  return (
    <div
      style={{ backgroundColor: `rgba(14, 14, 14, ${bgOpacity})` }}
      className="flex items-center gap-4 px-3 py-2 border-b border-[#202020] text-xs select-none font-sans"
    >
      {/* Interviewer Loopback Meter */}
      <div className="flex-1 flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-[#aaaaaa] font-medium min-w-[85px]">
          <Volume2 className={`w-3.5 h-3.5 transition-colors ${loopbackActive ? "text-[#38bdf8] animate-pulse" : "text-[#555555]"}`} />
          <span className={loopbackActive ? "text-[#38bdf8] font-bold" : "text-[#bbbbbb]"}>Interviewer</span>
        </div>

        {/* Level Track */}
        <div className="flex-1 h-2 bg-[#1a1a1a] border border-[#262626] overflow-hidden">
          <div
            className={`h-full transition-all duration-75 ease-out ${
              loopbackActive ? "bg-[#38bdf8]" : "bg-[#1e4a66]"
            }`}
            style={{ width: `${loopbackPct}%` }}
          />
        </div>

        {/* Voice Active Dot */}
        <span
          className={`w-2 h-2 rounded-full transition-colors ${
            loopbackActive ? "bg-[#38bdf8] shadow-[0_0_6px_#38bdf8]" : "bg-[#282828]"
          }`}
          title={loopbackActive ? "Interviewer speaking" : "Interviewer silent"}
        />
      </div>

      {/* Vertical Divider */}
      <div className="h-3.5 w-[1px] bg-[#2a2a2a]" />

      {/* Candidate Mic Meter */}
      <div className="flex-1 flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-[#aaaaaa] font-medium min-w-[50px]">
          <Mic className={`w-3.5 h-3.5 transition-colors ${micActive ? "text-[#4ade80] animate-pulse" : "text-[#555555]"}`} />
          <span className={micActive ? "text-[#4ade80] font-bold" : "text-[#bbbbbb]"}>You</span>
        </div>

        {/* Level Track */}
        <div className="flex-1 h-2 bg-[#1a1a1a] border border-[#262626] overflow-hidden">
          <div
            className={`h-full transition-all duration-75 ease-out ${
              micActive ? "bg-[#4ade80]" : "bg-[#1c4d28]"
            }`}
            style={{ width: `${micPct}%` }}
          />
        </div>

        {/* Voice Active Dot */}
        <span
          className={`w-2 h-2 rounded-full transition-colors ${
            micActive ? "bg-[#4ade80] shadow-[0_0_6px_#4ade80]" : "bg-[#282828]"
          }`}
          title={micActive ? "You speaking" : "You silent"}
        />
      </div>
    </div>
  );
};
