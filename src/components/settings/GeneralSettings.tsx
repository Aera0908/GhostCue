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
    { key: "Ctrl + Shift + K", desc: "Generate Code Solution & Complexities" },
    { key: "Ctrl + Shift + L", desc: "Generate Clarifying Questions" },
    { key: "Ctrl + Shift + E", desc: "Generate Architectural Deep Dive" },
    { key: "Esc", desc: "Stop active AI generation" },
  ];

  return (
    <div className="space-y-4 text-xs">
      {/* Anti-Capture Card */}
      <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <div>
              <p className="font-semibold text-slate-200">OS-Level Anti-Capture Stealth</p>
              <p className="text-[10px] text-slate-400">
                Uses Windows <code className="font-mono text-sky-400">WDA_EXCLUDEFROMCAPTURE</code>
              </p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={config.anti_capture_enabled}
            onChange={(e) => onChange("anti_capture_enabled", e.target.checked)}
            className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
          />
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          When enabled, the GhostCue HUD window is completely excluded from screen captures, screen sharing in Zoom, Microsoft Teams, Google Meet, Discord, OBS, and screenshot utilities.
        </p>
      </div>

      {/* Default Opacity */}
      <div>
        <div className="flex justify-between text-slate-300 mb-1">
          <span className="flex items-center gap-1">
            <Eye className="w-3.5 h-3.5 text-sky-400" />
            <span>Default HUD Opacity</span>
          </span>
          <span className="font-mono text-sky-400">{Math.round(config.opacity * 100)}%</span>
        </div>
        <input
          type="range"
          min="0.2"
          max="1.0"
          step="0.02"
          value={config.opacity}
          onChange={(e) => onChange("opacity", parseFloat(e.target.value))}
          className="w-full h-1.5 bg-slate-700 rounded-lg accent-sky-400 cursor-pointer"
        />
      </div>

      {/* Shortcuts Guide Table */}
      <div className="pt-2 border-t border-slate-800">
        <h4 className="flex items-center gap-1.5 font-semibold text-slate-200 mb-2">
          <Command className="w-3.5 h-3.5 text-purple-400" />
          <span>Global Stealth Hotkeys</span>
        </h4>

        <div className="rounded-lg border border-slate-800 bg-slate-900/50 overflow-hidden divide-y divide-slate-800/60">
          {hotkeys.map((hk) => (
            <div key={hk.key} className="flex items-center justify-between px-3 py-2 text-[11px]">
              <span className="text-slate-300">{hk.desc}</span>
              <kbd className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[10px]">
                {hk.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
