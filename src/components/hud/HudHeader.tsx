import React from "react";
import {
  ShieldCheck,
  ShieldAlert,
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
  RotateCw,
  Monitor,
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
  onToggleFocusShield?: () => void;
  onToggleAutoTrigger: () => void;
  onToggleLiveOcr?: () => void;
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
  onToggleFocusShield,
  onToggleAutoTrigger,
  onToggleLiveOcr,
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

  const headerRef = React.useRef<HTMLElement | null>(null);
  const [headerWidth, setHeaderWidth] = React.useState<number>(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth;
    }
    return 780;
  });

  React.useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect) {
          setHeaderWidth(entry.contentRect.width);
        }
      }
    });

    observer.observe(el);
    setHeaderWidth(el.clientWidth || window.innerWidth);

    return () => {
      observer.disconnect();
    };
  }, []);

  // Responsiveness thresholds based on measured header pixel width:
  // - headerWidth >= 920: Luxury space -> normal 3-button layout tabs AND full action button text
  // - 580 <= headerWidth < 920: Standard/Default HUD space (e.g. 780px) -> normal 3-button layout tabs, action buttons transform to sleek icons
  // - headerWidth < 580: Constrained space -> layout switcher collapses to Carousel, action buttons are icons
  // - headerWidth < 460: Ultra-compact -> sessions also transforms to icon-only
  const showFullModeTabs = headerWidth >= 580;
  const showActionText = headerWidth >= 920;
  const showSessionText = headerWidth >= 460;

  const handleCycleLayoutMode = () => {
    if (layoutMode === "ask") {
      onChangeLayoutMode("split");
    } else if (layoutMode === "split") {
      onChangeLayoutMode("listen");
    } else {
      onChangeLayoutMode("ask");
    }
  };

  const getModeInfo = () => {
    switch (layoutMode) {
      case "split":
        return {
          icon: Columns2,
          label: "Split",
          title: "Split View (Transcripts & Copilot side-by-side). Click to cycle view (Split → Listen → Ask)",
        };
      case "listen":
        return {
          icon: Headphones,
          label: "Listen",
          title: "Listen View (Audio Transcripts Stream). Click to cycle view (Listen → Ask → Split)",
        };
      case "ask":
      default:
        return {
          icon: MessageSquare,
          label: "Ask",
          title: "Ask View (AI Copilot Studio & Answers). Click to cycle view (Ask → Split → Listen)",
        };
    }
  };

  const currentMode = getModeInfo();
  const ModeIcon = currentMode.icon;

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
      ref={headerRef}
      data-tauri-drag-region
      onMouseDown={triggerDrag}
      style={{ backgroundColor: `rgba(15, 23, 42, ${opacity})` }}
      role="banner"
      className="flex items-center justify-between px-3 py-1.5 select-none cursor-move border-b border-slate-700/80 rounded-t-xl transition-colors font-sans gap-2 w-full max-w-full overflow-hidden"
    >
      {/* Left: Sessions & View Mode Switcher (Full 3-mode selector if available, or compact Carousel when tight) */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Sessions Button */}
        <button
          type="button"
          onClick={onOpenSessions}
          aria-label="Open sessions hub"
          className={`flex items-center bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold rounded-lg border border-slate-700 shadow-sm transition-all focus-visible:ring-2 focus-visible:ring-sky-400 shrink-0 ${
            showSessionText ? "gap-1.5 px-2 py-1" : "p-1.5"
          }`}
          title={`${t.header.sessionSetup} (Ctrl+H)`}
        >
          <LayoutGrid className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          {showSessionText && <span>{t.header.sessionSetup.split(" ")[0] || "Sessions"}</span>}
        </button>

        {sessionTitle && showSessionText && (
          <span className="text-xs text-slate-400 truncate max-w-[90px] font-medium hidden md:inline">
            / {sessionTitle}
          </span>
        )}

        {/* View Layout Switcher */}
        {!isCompactPill && (
          showFullModeTabs ? (
            /* Normal 3-Button Selection (when space is available) */
            <div className="flex items-center bg-slate-900/90 border border-slate-700/80 rounded-lg p-0.5 shadow-inner shrink-0 animate-in fade-in duration-200">
              <button
                type="button"
                onClick={() => onChangeLayoutMode("split")}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-all focus-visible:ring-1 focus-visible:ring-sky-400 ${
                  layoutMode === "split"
                    ? "bg-sky-500 text-white shadow-sm font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
                title="Split View: Transcripts & AI Copilot side-by-side"
              >
                <Columns2 className="w-3.5 h-3.5 shrink-0" />
                <span>Split</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeLayoutMode("ask")}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-all focus-visible:ring-1 focus-visible:ring-sky-400 ${
                  layoutMode === "ask"
                    ? "bg-sky-500 text-white shadow-sm font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
                title="Ask View: AI Copilot Studio & Answers"
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                <span>Ask</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeLayoutMode("listen")}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-all focus-visible:ring-1 focus-visible:ring-sky-400 ${
                  layoutMode === "listen"
                    ? "bg-sky-500 text-white shadow-sm font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
                title="Listen View: Audio Transcripts Stream"
              >
                <Headphones className="w-3.5 h-3.5 shrink-0" />
                <span>Listen</span>
              </button>
            </div>
          ) : (
            /* Space-Saving Carousel Switcher (when space is constrained) */
            <button
              type="button"
              onClick={handleCycleLayoutMode}
              className="flex items-center gap-1.5 px-2 py-1 bg-slate-900/90 hover:bg-slate-800 border border-slate-700/90 hover:border-sky-500/60 text-slate-200 hover:text-white rounded-lg text-xs font-semibold shadow-sm transition-all focus-visible:ring-2 focus-visible:ring-sky-400 shrink-0 group active:scale-95 animate-in fade-in duration-200"
              title={currentMode.title}
            >
              <ModeIcon className="w-3.5 h-3.5 text-sky-400 group-hover:scale-110 transition-transform shrink-0" />
              <span className="font-bold text-slate-100">{currentMode.label}</span>
              {/* 3-dot Carousel Position Indicator */}
              <div className="flex gap-0.5 items-center mx-0.5" aria-hidden="true">
                <span className={`w-1 h-1 rounded-full transition-colors ${layoutMode === "ask" ? "bg-sky-400 shadow-[0_0_4px_#38bdf8]" : "bg-slate-600"}`} />
                <span className={`w-1 h-1 rounded-full transition-colors ${layoutMode === "split" ? "bg-sky-400 shadow-[0_0_4px_#38bdf8]" : "bg-slate-600"}`} />
                <span className={`w-1 h-1 rounded-full transition-colors ${layoutMode === "listen" ? "bg-sky-400 shadow-[0_0_4px_#38bdf8]" : "bg-slate-600"}`} />
              </div>
              <RotateCw className="w-2.5 h-2.5 text-slate-400 group-hover:text-sky-300 group-hover:rotate-180 transition-all duration-300 shrink-0" />
            </button>
          )
        )}
      </div>

      {/* Center: Draggable Handle */}
      <div
        data-tauri-drag-region
        onMouseDown={triggerDrag}
        className="flex-1 min-w-[8px] flex items-center justify-center py-1 text-slate-500 hover:text-slate-300 transition-colors cursor-move"
        title="Drag Window"
      >
        <div className="flex gap-1">
          <div className="w-1 h-1 rounded-full bg-slate-500/70" />
          <div className="w-1 h-1 rounded-full bg-slate-500/70" />
          <div className="w-1 h-1 rounded-full bg-slate-500/70" />
        </div>
      </div>

      {/* Right: Essential Action Controls (Compact & Space-Optimized) */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Ghost Mode (Anti-Capture) Toggle */}
        <button
          type="button"
          onClick={onToggleAntiCapture}
          aria-label={config.anti_capture_enabled ? "Stealth Mode ON" : "Stealth Mode OFF"}
          className={`flex items-center text-xs font-semibold rounded-lg border transition-all focus-visible:ring-2 focus-visible:ring-sky-400 ${
            showActionText ? "gap-1.5 px-2 py-1" : "p-1.5"
          } ${
            config.anti_capture_enabled
              ? "bg-emerald-950/70 border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/70"
              : "bg-rose-950/70 border-rose-500/50 text-rose-300 hover:bg-rose-900/70"
          }`}
          title={config.anti_capture_enabled ? "Stealth Mode ON (GhostCue hidden from screen capture & recording)" : "Stealth Mode OFF (GhostCue visible in capture)"}
        >
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
          {showActionText && <span>{config.anti_capture_enabled ? t.header.stealthMode : t.header.stealthOff}</span>}
        </button>

        {/* Anti Out-of-Focus / Assessment Anti-Detection (Focus Shield) */}
        {onToggleFocusShield && (
          <button
            type="button"
            onClick={onToggleFocusShield}
            aria-label={(config.focus_shield_enabled ?? true) ? "Focus Shield ON" : "Focus Shield OFF"}
            className={`flex items-center text-xs font-semibold rounded-lg border transition-all focus-visible:ring-2 focus-visible:ring-indigo-400 ${
              showActionText ? "gap-1.5 px-2 py-1" : "p-1.5"
            } ${
              (config.focus_shield_enabled ?? true)
                ? "bg-indigo-950/70 border-indigo-500/50 text-indigo-300 hover:bg-indigo-900/70 shadow-sm"
                : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
            }`}
            title={
              (config.focus_shield_enabled ?? true)
                ? "Focus Shield ON: Clicks on GhostCue will NOT steal focus from exam/browser (Ctrl+Shift+F). Click to disable and type into GhostCue."
                : "Focus Shield OFF: Typing enabled in GhostCue. Click to enable Focus Shield to prevent exam blur violations (Ctrl+Shift+F)."
            }
          >
            <ShieldAlert className={`w-3.5 h-3.5 shrink-0 ${(config.focus_shield_enabled ?? true) ? "text-indigo-400" : "text-slate-400"}`} />
            {showActionText && <span>Focus: {(config.focus_shield_enabled ?? true) ? "ON" : "OFF"}</span>}
          </button>
        )}

        {/* Pause / Resume Button */}
        {onTogglePause && (
          <button
            type="button"
            onClick={onTogglePause}
            aria-label={isPaused ? "Resume Live Listening" : "Pause Live Listening"}
            className={`flex items-center text-xs font-semibold rounded-lg border transition-all focus-visible:ring-2 focus-visible:ring-amber-400 ${
              showActionText ? "gap-1.5 px-2 py-1" : "p-1.5"
            } ${
              isPaused
                ? "bg-amber-500/20 border-amber-400/80 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.3)] animate-pulse"
                : "bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700"
            }`}
            title={isPaused ? "Resume Live Listening & Answering (Ctrl+Shift+P)" : "Pause Live Listening & Answering (Ctrl+Shift+P)"}
          >
            {isPaused ? (
              <>
                <Play className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                {showActionText && <span className="font-bold text-amber-300">Paused</span>}
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                {showActionText && <span>Pause</span>}
              </>
            )}
          </button>
        )}

        {/* Auto-Answer Toggle */}
        <button
          type="button"
          onClick={onToggleAutoTrigger}
          aria-label={config.auto_trigger_enabled ? "Auto-Answer ON" : "Auto-Answer OFF"}
          className={`flex items-center text-xs font-semibold rounded-lg border transition-all focus-visible:ring-2 focus-visible:ring-sky-400 ${
            showActionText ? "gap-1.5 px-2 py-1" : "p-1.5"
          } ${
            config.auto_trigger_enabled
              ? "bg-sky-950/70 border-sky-500/50 text-sky-300 hover:bg-sky-900/70"
              : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
          }`}
          title={config.auto_trigger_enabled ? `Auto-Answer: ON (${((config.auto_trigger_delay_ms || 1500) / 1000).toFixed(1)}s conversational pause delay)` : "Auto-Answer: OFF"}
        >
          <Sparkles className={`w-3.5 h-3.5 shrink-0 ${config.auto_trigger_enabled ? "text-sky-400" : "text-slate-400"}`} />
          {showActionText && <span>Auto: {config.auto_trigger_enabled ? "ON" : "OFF"}</span>}
        </button>

        {/* Live Screen OCR Toggle */}
        {onToggleLiveOcr && (
          <button
            type="button"
            onClick={onToggleLiveOcr}
            aria-label={config.live_ocr_enabled ? "Live Screen OCR ON" : "Live Screen OCR OFF"}
            className={`flex items-center text-xs font-semibold rounded-lg border transition-all focus-visible:ring-2 focus-visible:ring-rose-400 ${
              showActionText ? "gap-1.5 px-2 py-1" : "p-1.5"
            } ${
              config.live_ocr_enabled
                ? "bg-rose-950/70 border-rose-500/50 text-rose-300 hover:bg-rose-900/70 shadow-sm animate-pulse"
                : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
            }`}
            title={
              config.live_ocr_enabled
                ? `Live Screen OCR: ON (Scanning screen every ${config.live_ocr_interval_secs || 10}s - Ctrl+Shift+O). Click to toggle.`
                : `Live Screen OCR: OFF (Click to auto-scan screen every ${config.live_ocr_interval_secs || 10}s - Ctrl+Shift+O)`
            }
          >
            <Monitor className={`w-3.5 h-3.5 shrink-0 ${config.live_ocr_enabled ? "text-rose-400" : "text-slate-400"}`} />
            {showActionText && <span>OCR: {config.live_ocr_enabled ? `${config.live_ocr_interval_secs || 10}s` : "OFF"}</span>}
          </button>
        )}

        {/* Settings */}
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Open settings and shortcut cheatsheet"
          className="p-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-sky-400 shrink-0"
          title={`${t.header.settings}${activeProvider ? ` (${activeProvider})` : ""} (Ctrl+,)`}
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        {/* Compact Pill Toggle */}
        <button
          type="button"
          onClick={onToggleCompactPill}
          aria-label={isCompactPill ? "Expand HUD" : "Compact Pill HUD"}
          className="p-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-sky-400 shrink-0"
          title={isCompactPill ? "Expand HUD" : "Compact Pill Mode"}
        >
          {isCompactPill ? <Maximize className="w-3.5 h-3.5" /> : <Minimize className="w-3.5 h-3.5" />}
        </button>

        {/* Close App */}
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={async (e) => {
            e.stopPropagation();
            try {
              await TauriApi.exitApp();
            } catch {
              try {
                await getCurrentWebviewWindow().close();
              } catch {
                window.close();
              }
            }
          }}
          aria-label="Close application"
          className="p-1.5 bg-slate-800 hover:bg-rose-900/80 border border-slate-700 hover:border-rose-600/60 text-slate-400 hover:text-rose-200 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-rose-400 shrink-0 cursor-pointer"
          title="Exit GhostCue"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
