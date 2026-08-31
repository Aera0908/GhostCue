import React from "react";
import { Eye, ShieldCheck, Settings, Mic, MicOff, MousePointerClick, GripHorizontal, EyeOff } from "lucide-react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { AppConfig } from "../../types/config";

interface HudHeaderProps {
  config: AppConfig;
  opacity: number;
  onOpacityChange: (val: number) => void;
  clickThrough: boolean;
  onToggleClickThrough: () => void;
  onToggleAntiCapture: () => void;
  onOpenSettings: () => void;
  onPanicHide: () => void;
  isCapturing: boolean;
  onToggleCapture: () => void;
  activeProvider: string;
}

export const HudHeader: React.FC<HudHeaderProps> = ({
  config,
  opacity,
  onOpacityChange,
  clickThrough,
  onToggleClickThrough,
  onToggleAntiCapture,
  onOpenSettings,
  onPanicHide,
  isCapturing,
  onToggleCapture,
  activeProvider,
}) => {
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, input, textarea, select, a, [role='slider']")) {
      return;
    }
    if (e.button === 0) {
      try {
        const appWindow = getCurrentWebviewWindow();
        appWindow.startDragging();
      } catch (err) {
        console.warn("Window drag error:", err);
      }
    }
  };

  return (
    <header
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
      className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-slate-950/90 backdrop-blur-md select-none cursor-move rounded-t-xl"
    >
      {/* Brand & Anti-Capture Stealth Badge */}
      <div className="flex items-center gap-2.5 pointer-events-none">
        <div className="flex items-center gap-1.5">
          <div className="relative flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-tr from-sky-500 to-indigo-600 shadow-md shadow-sky-500/20">
            <span className="text-xs font-black tracking-tighter text-white">GC</span>
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-75" />
          </div>
          <span className="text-sm font-semibold tracking-wide text-slate-100 font-sans">
            Ghost<span className="text-sky-400">Cue</span>
          </span>
        </div>

        {/* Anti-Capture Badge */}
        <button
          type="button"
          onClick={onToggleAntiCapture}
          className={`pointer-events-auto flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full transition-all border ${
            config.anti_capture_enabled
              ? "bg-emerald-950/70 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/80 shadow-[0_0_8px_rgba(16,185,129,0.25)]"
              : "bg-rose-950/70 border-rose-500/40 text-rose-300 hover:bg-rose-900/80"
          }`}
          title="Window is invisible to Zoom, Teams, Meet, Discord & OBS via WDA_EXCLUDEFROMCAPTURE"
        >
          <ShieldCheck className="w-3 h-3" />
          <span>{config.anti_capture_enabled ? "STEALTH ON" : "STEALTH OFF"}</span>
        </button>

        {/* Provider Badge */}
        <span className="hidden sm:inline-flex px-1.5 py-0.5 text-[10px] font-mono rounded bg-slate-800/80 border border-slate-700/60 text-slate-300 uppercase">
          {activeProvider}
        </span>
      </div>

      {/* Center Drag Handle */}
      <div className="flex items-center gap-1 text-slate-500 text-[11px] pointer-events-none hover:text-slate-300 transition-colors">
        <GripHorizontal className="w-4 h-4 text-slate-400" />
        <span className="hidden md:inline">Hold & Drag HUD</span>
      </div>

      {/* Control Actions & Sliders */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Opacity Controller */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-900/60 border border-white/5">
          <Eye className="w-3 h-3 text-slate-400" />
          <input
            type="range"
            min="0.2"
            max="1.0"
            step="0.02"
            value={opacity}
            onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
            className="w-14 sm:w-16 h-1 accent-sky-400 bg-slate-700 rounded-lg cursor-pointer"
            title={`HUD Opacity: ${Math.round(opacity * 100)}%`}
          />
          <span className="text-[10px] font-mono text-slate-400 w-6 text-right">
            {Math.round(opacity * 100)}%
          </span>
        </div>

        {/* Audio Capture Toggle */}
        <button
          type="button"
          onClick={onToggleCapture}
          className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border transition-all ${
            isCapturing
              ? "bg-sky-950/60 border-sky-500/50 text-sky-300 hover:bg-sky-900/60 shadow-[0_0_8px_rgba(56,189,248,0.2)]"
              : "bg-slate-900/60 border-slate-700/60 text-slate-400 hover:text-slate-200"
          }`}
          title={isCapturing ? "Audio Capture Active" : "Audio Capture Paused"}
        >
          {isCapturing ? <Mic className="w-3.5 h-3.5 text-sky-400 animate-pulse" /> : <MicOff className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{isCapturing ? "Listening" : "Paused"}</span>
        </button>

        {/* Click Through Toggle */}
        <button
          type="button"
          onClick={onToggleClickThrough}
          className={`p-1.5 rounded-md border text-xs transition-all ${
            clickThrough
              ? "bg-purple-950/70 border-purple-500/50 text-purple-300 shadow-[0_0_8px_rgba(168,85,247,0.2)]"
              : "bg-slate-900/60 border-slate-700/60 text-slate-400 hover:text-slate-200"
          }`}
          title="Click-Through Mode (Ctrl+Shift+C)"
        >
          <MousePointerClick className="w-3.5 h-3.5" />
        </button>

        {/* Settings Modal Toggle */}
        <button
          type="button"
          onClick={onOpenSettings}
          className="p-1.5 rounded-md bg-slate-900/60 border border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all"
          title="Configure Context & Models (Ctrl+,)"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        {/* Panic Hide */}
        <button
          type="button"
          onClick={onPanicHide}
          className="p-1.5 rounded-md bg-rose-950/60 border border-rose-800/60 text-rose-300 hover:bg-rose-900/80 transition-all"
          title="Panic Hide HUD (Ctrl+Shift+H)"
        >
          <EyeOff className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
