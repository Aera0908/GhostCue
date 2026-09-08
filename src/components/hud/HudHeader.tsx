import React from "react";
import {
  ShieldCheck,
  Settings,
  LayoutGrid,
  Sparkles,
  X,
  MessageSquare,
  Headphones,
  Columns2,
  Minimize,
  Maximize,
  Pause,
  Play,
} from "lucide-react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { AppConfig } from "../../types/config";
import { TauriApi } from "../../services/tauriApi";
import { useTranslation } from "../../i18n";

export type HudLayoutMode = "split" | "ask" | "listen";

interface HudHeaderProps {
  config: AppConfig;
  opacity: number;
  onOpacityChange?: (val: number) => void;
  clickThrough?: boolean;
  onToggleClickThrough?: () => void;
  onToggleAntiCapture: () => void;
  onToggleAutoTrigger: () => void;
  onOpenSettings: () => void;
  onOpenSessions: () => void;
  layoutMode: HudLayoutMode;
  onChangeLayoutMode: (mode: HudLayoutMode) => void;
  isCompactPill: boolean;
  onToggleCompactPill: () => void;
  activeProvider?: string;
  sessionTitle?: string;
  isPaused?: boolean;
  onTogglePause?: () => void;
}

export const HudHeader: React.FC<HudHeaderProps> = ({
  config,
  opacity,
  onToggleAntiCapture,
  onToggleAutoTrigger,
  onOpenSettings,
  onOpenSessions,
  layoutMode,
  onChangeLayoutMode,
  isCompactPill,
  onToggleCompactPill,
  activeProvider,
  sessionTitle,
  isPaused = false,
  onTogglePause,
}) => {
  const { t } = useTranslation();

  const triggerDrag = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, input, textarea, select, a, [role='slider'], [role='button']")) {
      return;
    }
    TauriApi.startDragging();
    try {
      getCurrentWebviewWindow().startDragging();
    } catch {
      // Fallback
    }
  };

  return (
    <header
      data-tauri-drag-region
      onMouseDown={triggerDrag}
      style={{ backgroundColor: `rgba(15, 23, 42, ${opacity})` }}
      role="banner"
      className="flex items-center justify-between px-3.5 py-2 select-none cursor-move border-b border-slate-700/80 rounded-t-xl transition-colors font-sans gap-3"
    >
      {/* Left: Sessions & Segmented Mode Switcher */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Sessions Button */}
        <button
          type="button"
          onClick={onOpenSessions}
          aria-label="Open sessions hub"
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold rounded-lg border border-slate-700 shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-sky-400 shrink-0"
          title={t.header.sessionSetup}
        >
          <LayoutGrid className="w-3.5 h-3.5 text-sky-400" />
          <span>{t.header.sessionSetup.split(" ")[0] || "Sessions"}</span>
        </button>

        {sessionTitle && (
          <span className="text-xs text-slate-400 truncate max-w-[130px] hidden lg:inline font-medium">
            / {sessionTitle}
          </span>
        )}

        {/* Segmented Mode Switcher */}
        {!isCompactPill && (
          <nav aria-label="HUD layout view" className="flex items-center bg-slate-900/90 p-0.5 rounded-lg border border-slate-700/80">
            <button
              type="button"
              onClick={() => onChangeLayoutMode("split")}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                layoutMode === "split"
                  ? "bg-sky-600 text-white font-semibold shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Split View"
            >
              <Columns2 className="w-3 h-3" />
              <span>Split</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeLayoutMode("ask")}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                layoutMode === "ask"
                  ? "bg-sky-600 text-white font-semibold shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title={t.header.askMode}
            >
              <MessageSquare className="w-3 h-3" />
              <span>{t.header.askMode.split(" ")[0] || "Ask"}</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeLayoutMode("listen")}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                layoutMode === "listen"
                  ? "bg-sky-600 text-white font-semibold shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Listen Mode"
            >
              <Headphones className="w-3 h-3" />
              <span>Listen</span>
            </button>
          </nav>
        )}
      </div>

      {/* Center: Draggable Handle */}
      <div
        data-tauri-drag-region
        onMouseDown={triggerDrag}
        className="flex-1 flex items-center justify-center py-1 text-slate-500 hover:text-slate-300 transition-colors cursor-move"
        title="Drag Window"
      >
        <div className="flex gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
          <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
          <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
        </div>
      </div>

      {/* Right: Essential Action Controls */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Ghost Mode Toggle */}
        <button
          type="button"
          onClick={onToggleAntiCapture}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors focus-visible:ring-2 focus-visible:ring-sky-400 ${
            config.anti_capture_enabled
              ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60"
              : "bg-rose-950/60 border-rose-500/40 text-rose-300 hover:bg-rose-900/60"
          }`}
          title={t.settings.antiCaptureDesc}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>{config.anti_capture_enabled ? t.header.stealthMode : t.header.stealthOff}</span>
        </button>

        {/* Active Model/Provider tag */}
        {activeProvider && (
          <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-800 border border-slate-700 text-slate-400 uppercase rounded-md hidden xl:inline">
            {activeProvider}
          </span>
        )}

        {/* Pause / Resume Button */}
        {onTogglePause && (
          <button
            type="button"
            onClick={onTogglePause}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all focus-visible:ring-2 focus-visible:ring-amber-400 ${
              isPaused
                ? "bg-amber-500/20 border-amber-400/80 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.3)] animate-pulse"
                : "bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700"
            }`}
            title={isPaused ? "Resume Live Listening & Answering (Ctrl+Shift+P)" : "Pause Live Listening & Answering (Ctrl+Shift+P)"}
          >
            {isPaused ? (
              <>
                <Play className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                <span className="font-bold text-amber-300">Paused</span>
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">Pause</span>
              </>
            )}
          </button>
        )}

        {/* Auto-Answer Toggle */}
        <button
          type="button"
          onClick={onToggleAutoTrigger}
          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors focus-visible:ring-2 focus-visible:ring-sky-400 ${
            config.auto_trigger_enabled
              ? "bg-sky-950/70 border-sky-500/50 text-sky-300 hover:bg-sky-900/70"
              : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
          }`}
          title={t.header.autoTriggerActive}
        >
          <Sparkles className={`w-3.5 h-3.5 ${config.auto_trigger_enabled ? "text-sky-400" : "text-slate-400"}`} />
          <span className="hidden sm:inline">Auto: {config.auto_trigger_enabled ? t.common.on : t.common.off}</span>
        </button>

        {/* Settings */}
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Open settings and shortcut cheatsheet"
          className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-sky-400"
          title={`${t.header.settings} (Ctrl+,)`}
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        {/* Compact Pill Toggle */}
        <button
          type="button"
          onClick={onToggleCompactPill}
          aria-label={isCompactPill ? "Expand HUD" : "Compact Pill HUD"}
          className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-sky-400"
          title={isCompactPill ? "Expand HUD" : "Compact Pill Mode"}
        >
          {isCompactPill ? <Maximize className="w-3.5 h-3.5" /> : <Minimize className="w-3.5 h-3.5" />}
        </button>

        {/* Close */}
        <button
          type="button"
          onClick={async () => {
            try {
              await TauriApi.exitApp();
            } catch {
              try {
                getCurrentWebviewWindow().close();
              } catch (_) {}
            }
          }}
          aria-label="Close GhostCue"
          className="p-1.5 bg-slate-800 hover:bg-rose-900 border border-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-rose-400"
          title={t.common.close}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
