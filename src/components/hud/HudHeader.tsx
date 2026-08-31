import React from "react";
import { Eye, ShieldCheck, Settings, Mic, MicOff, MousePointerClick, EyeOff, LayoutGrid, Sparkles } from "lucide-react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { AppConfig } from "../../types/config";
import { TauriApi } from "../../services/tauriApi";

interface HudHeaderProps {
  config: AppConfig;
  opacity: number;
  bgOpacity?: number;
  onOpacityChange: (val: number) => void;
  clickThrough: boolean;
  onToggleClickThrough: () => void;
  onToggleAntiCapture: () => void;
  onToggleAutoTrigger: () => void;
  onOpenSettings: () => void;
  onOpenSessions: () => void;
  onPanicHide: () => void;
  isCapturing: boolean;
  onToggleCapture: () => void;
  activeProvider: string;
  sessionTitle?: string;
}

export const HudHeader: React.FC<HudHeaderProps> = ({
  config,
  opacity,
  bgOpacity,
  onOpacityChange,
  clickThrough,
  onToggleClickThrough,
  onToggleAntiCapture,
  onToggleAutoTrigger,
  onOpenSettings,
  onOpenSessions,
  onPanicHide,
  isCapturing,
  onToggleCapture,
  activeProvider,
  sessionTitle,
}) => {
  const triggerDrag = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, input, textarea, select, a, [role='slider']")) {
      return;
    }
    TauriApi.startDragging();
    try {
      getCurrentWebviewWindow().startDragging();
    } catch {
      // Fallback
    }
  };

  const alpha = bgOpacity ?? opacity;

  return (
    <header
      data-tauri-drag-region
      onMouseDown={triggerDrag}
      style={{ backgroundColor: `rgba(20, 20, 20, ${alpha})` }}
      className="flex items-center justify-between px-3 py-2 select-none cursor-move border-b border-[#252525]"
    >
      {/* Brand & Sessions Button */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenSessions}
          className="flex items-center gap-1.5 px-2 py-1 bg-[#1e1e1e] hover:bg-[#282828] text-white text-xs font-semibold transition-colors"
          title="Open Interview History & Context Hub"
        >
          <LayoutGrid className="w-3.5 h-3.5 text-[#38bdf8]" />
          <span>Sessions</span>
        </button>

        {sessionTitle && (
          <span className="text-xs text-[#888888] truncate max-w-[130px] hidden sm:inline">
            / {sessionTitle}
          </span>
        )}

        <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#1e1e1e] text-[#777777] uppercase hidden md:inline">
          {activeProvider}
        </span>

        {/* Anti-Capture Stealth Status */}
        <button
          type="button"
          onClick={onToggleAntiCapture}
          className={`flex items-center gap-1 px-1.5 py-1 text-xs transition-colors ${
            config.anti_capture_enabled
              ? "bg-[#162216] text-[#4ade80] hover:bg-[#1c2e1c]"
              : "bg-[#281616] text-[#f87171] hover:bg-[#341d1d]"
          }`}
          title="Ghost Mode: Hides this window from Zoom, Teams, Meet, and screen recordings."
        >
          <ShieldCheck className="w-3 h-3" />
          <span>{config.anti_capture_enabled ? "Ghost Mode" : "Visible"}</span>
        </button>
      </div>

      {/* Center Dotted Square Drag Handle */}
      <div
        data-tauri-drag-region
        onMouseDown={triggerDrag}
        className="flex items-center justify-center p-1.5 text-[#666666] hover:text-[#bbbbbb] transition-colors cursor-move"
        title="Drag Window"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="pointer-events-none"
        >
          <circle cx="3" cy="3" r="1.2" />
          <circle cx="8" cy="3" r="1.2" />
          <circle cx="13" cy="3" r="1.2" />
          <circle cx="3" cy="8" r="1.2" />
          <circle cx="8" cy="8" r="1.2" />
          <circle cx="13" cy="8" r="1.2" />
          <circle cx="3" cy="13" r="1.2" />
          <circle cx="8" cy="13" r="1.2" />
          <circle cx="13" cy="13" r="1.2" />
        </svg>
      </div>

      {/* Control Actions & Sliders */}
      <div className="flex items-center gap-1.5">
        {/* Opacity Controller */}
        <div className="flex items-center gap-1.5 px-2 py-1 bg-[#1c1c1c] text-[#cccccc]" title="HUD Transparency">
          <Eye className="w-3.5 h-3.5 text-[#777777]" />
          <input
            type="range"
            min="0.2"
            max="1.0"
            step="0.02"
            value={opacity}
            onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
            className="w-12 h-1 accent-[#ffffff] bg-[#333333] cursor-pointer"
          />
          <span className="text-[11px] font-mono text-[#888888] w-6 text-right">
            {Math.round(opacity * 100)}%
          </span>
        </div>

        {/* Auto-Answer Quick Toggle */}
        <button
          type="button"
          onClick={onToggleAutoTrigger}
          className={`flex items-center gap-1 px-2 py-1 text-xs font-semibold transition-colors ${
            config.auto_trigger_enabled
              ? "bg-[#163650] border border-[#38bdf8]/60 text-[#38bdf8] hover:bg-[#1a4466]"
              : "bg-[#1c1c1c] text-[#777777] hover:text-[#cccccc] hover:bg-[#252525]"
          }`}
          title="Auto-Answer: Automatically generates AI answers when interviewer questions are detected."
        >
          <Sparkles className={`w-3.5 h-3.5 ${config.auto_trigger_enabled ? "text-[#38bdf8]" : "text-[#777777]"}`} />
          <span className="hidden sm:inline">Auto: {config.auto_trigger_enabled ? "ON" : "OFF"}</span>
        </button>

        {/* Audio Capture Toggle */}
        <button
          type="button"
          onClick={onToggleCapture}
          className={`flex items-center gap-1 px-2 py-1 text-xs transition-colors ${
            isCapturing
              ? "bg-[#1c1c1c] text-[#4ade80] hover:bg-[#252525]"
              : "bg-[#1c1c1c] text-[#777777] hover:text-[#cccccc]"
          }`}
          title={isCapturing ? "Listening to audio" : "Audio paused"}
        >
          {isCapturing ? <Mic className="w-3.5 h-3.5 text-[#4ade80]" /> : <MicOff className="w-3.5 h-3.5 text-[#777777]" />}
          <span className="hidden sm:inline">{isCapturing ? "Live" : "Paused"}</span>
        </button>

        {/* Click-Through Toggle */}
        <button
          type="button"
          onClick={onToggleClickThrough}
          className={`p-1.5 text-xs transition-colors ${
            clickThrough
              ? "bg-[#2a1e36] text-[#c084fc]"
              : "bg-[#1c1c1c] text-[#777777] hover:text-[#cccccc] hover:bg-[#252525]"
          }`}
          title="Click-Through: Lets you click behind the HUD (Ctrl+Shift+C)"
        >
          <MousePointerClick className="w-3.5 h-3.5" />
        </button>

        {/* Settings Button */}
        <button
          type="button"
          onClick={onOpenSettings}
          className="p-1.5 bg-[#1c1c1c] text-[#777777] hover:text-[#ffffff] hover:bg-[#252525] transition-colors"
          title="Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        {/* Panic Hide */}
        <button
          type="button"
          onClick={onPanicHide}
          className="p-1.5 bg-[#261414] text-[#f87171] hover:bg-[#381c1c] transition-colors"
          title="Hide HUD immediately (Ctrl+Shift+H)"
        >
          <EyeOff className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
