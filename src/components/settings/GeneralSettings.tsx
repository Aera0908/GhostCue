import React from "react";
import { ShieldCheck, Command, Eye } from "lucide-react";
import { AppConfig } from "../../types/config";

interface GeneralSettingsProps {
  config: AppConfig;
  onChange: (key: keyof AppConfig, value: any) => void;
}

export const GeneralSettings: React.FC<GeneralSettingsProps> = ({ config, onChange }) => {
  const hotkeys = [
    { key: "Ctrl + Shift + H", desc: "Panic Hide / Restore HUD instantly" },
    { key: "Ctrl + Shift + C", desc: "Toggle Click-Through mode (pass clicks behind HUD)" },
    { key: "Ctrl + Shift + Space", desc: "Force Instant Interview Hint" },
    { key: "Ctrl + Shift + K", desc: "Generate Code Solution & Split IDE" },
    { key: "Ctrl + Shift + L", desc: "Generate Clarifying Questions" },
    { key: "Ctrl + Shift + E", desc: "Generate Architectural Deep Dive" },
    { key: "Esc", desc: "Stop active AI generation" },
  ];

  return (
    <div className="space-y-4 text-sm font-sans">
      {/* Anti-Capture Card */}
      <div className="p-3 bg-[#121212] border border-[#1f1f1f] space-y-2 font-mono text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#4ade80]" />
            <div>
              <p className="font-bold text-white uppercase">OS-Level Anti-Capture Stealth</p>
              <p className="text-[11px] text-[#666666]">
                Windows WDA_EXCLUDEFROMCAPTURE
              </p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={config.anti_capture_enabled}
            onChange={(e) => onChange("anti_capture_enabled", e.target.checked)}
            className="w-4 h-4 accent-white cursor-pointer"
          />
        </div>
        <p className="text-xs text-[#888888] font-sans leading-relaxed">
          When enabled, the GhostCue HUD window is completely hidden from screen captures and screen shares in Zoom, Teams, Meet, Discord, OBS, and screenshot tools.
        </p>
      </div>

      {/* Default Opacity Card */}
      <div className="p-3 bg-[#121212] border border-[#1f1f1f] space-y-1.5 font-mono text-xs">
        <div className="flex justify-between text-[#cccccc]">
          <span className="flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-[#888888]" />
            <span className="font-bold text-white uppercase">Default HUD Opacity</span>
          </span>
          <span className="text-white font-bold">{Math.round(config.opacity * 100)}%</span>
        </div>
        <input
          type="range"
          min="0.2"
          max="1.0"
          step="0.02"
          value={config.opacity}
          onChange={(e) => onChange("opacity", parseFloat(e.target.value))}
          className="w-full h-1.5 bg-[#080808] accent-white cursor-pointer"
        />
      </div>

      {/* Shortcuts Guide Table Card */}
      <div className="p-3 bg-[#121212] border border-[#1f1f1f] space-y-2 font-mono text-xs">
        <h4 className="flex items-center gap-2 font-bold text-white uppercase">
          <Command className="w-3.5 h-3.5 text-[#c084fc]" />
          <span>Global Stealth Hotkeys</span>
        </h4>

        <div className="bg-[#080808] border border-[#1c1c1c] divide-y divide-[#181818]">
          {hotkeys.map((hk) => (
            <div key={hk.key} className="flex items-center justify-between px-3 py-2 text-xs">
              <span className="text-[#cccccc] font-sans">{hk.desc}</span>
              <kbd className="px-2 py-0.5 bg-[#181818] border border-[#282828] text-white font-mono text-[11px] font-bold">
                {hk.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
