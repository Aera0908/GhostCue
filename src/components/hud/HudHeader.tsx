import React from "react";
import { ChevronLeft, EyeOff, Minimize2, Minus, Monitor, Pause, Play, Settings, Sparkles, X } from "lucide-react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { AppConfig } from "../../types/config";
import { TauriApi } from "../../services/tauriApi";

export type HudLayoutMode = "split" | "ask" | "listen";

interface HudHeaderProps {
  config: AppConfig;
  opacity: number;
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

const VIEWS: Array<[HudLayoutMode, string, string]> = [
  ["split", "Both", "Transcript above, answer below"],
  ["ask", "Answer", "Answer only"],
  ["listen", "Transcript", "Transcript only"],
];

const ICON =
  "grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-g-hover active:bg-g-base " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-g-accent";

/** A control that is either on or off. On is the accent colour; off is quiet. */
const Toggle: React.FC<{
  on: boolean;
  label: string;
  title: string;
  onClick?: () => void;
  children: React.ReactNode;
}> = ({ on, label, title, onClick, children }) => (
  <button
    type="button"
    aria-label={label}
    aria-pressed={on}
    title={title}
    onClick={onClick}
    className={`${ICON} ${on ? "text-g-accent" : "text-g-muted hover:text-g-text"}`}
  >
    {children}
  </button>
);

export const HudHeader: React.FC<HudHeaderProps> = ({
  config,
  opacity,
  onToggleAntiCapture,
  onToggleAutoTrigger,
  onToggleLiveOcr,
  onOpenSettings,
  onOpenSessions,
  layoutMode,
  onChangeLayoutMode,
  onToggleCompactPill,
  sessionTitle,
  isPaused = false,
  onTogglePause,
}) => {
  const drag = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (event.button !== 0 || target.closest("button, input, textarea, select, a")) return;
    void TauriApi.startDragging().catch(() => {});
  };

  const close = async () => {
    try {
      await TauriApi.exitApp();
    } catch {
      try {
        await getCurrentWebviewWindow().close();
      } catch {
        window.close();
      }
    }
  };

  return (
    <header
      onMouseDown={drag}
      style={{ backgroundColor: `rgba(14, 15, 17, ${opacity})` }}
      className="flex h-10 w-full shrink-0 cursor-default select-none items-center gap-2 overflow-hidden rounded-t-lg border-b border-g-line pl-1.5 pr-1.5"
    >
      <button
        type="button"
        onClick={onOpenSessions}
        aria-label="Back to interviews"
        title="Back to interviews"
        className={`${ICON} text-g-muted hover:text-g-text`}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <span className="min-w-0 max-w-[30%] truncate text-[13px] font-medium text-g-text" title={sessionTitle}>
        {sessionTitle || "Interview"}
      </span>

      <div role="group" aria-label="What to show" className="ml-2 flex shrink-0 items-center rounded-md border border-g-line p-0.5">
        {VIEWS.map(([mode, label, title]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={layoutMode === mode}
            title={title}
            onClick={() => onChangeLayoutMode(mode)}
            className={
              "h-6 rounded px-2.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-g-accent " +
              (layoutMode === mode
                ? "bg-g-raised font-medium text-g-text"
                : "text-g-muted hover:text-g-text active:bg-g-base")
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={onTogglePause}
          aria-pressed={isPaused}
          title={isPaused ? "Resume listening (Ctrl+Shift+P)" : "Pause listening (Ctrl+Shift+P)"}
          className={
            "mr-1 flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium " +
            "transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none " +
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-g-accent " +
            (isPaused
              ? "border-g-accent bg-g-accent text-g-accentInk hover:bg-g-accentHover"
              : "border-g-line text-g-text hover:border-g-lineStrong hover:bg-g-hover")
          }
        >
          {isPaused ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}
          {isPaused ? "Resume" : "Pause"}
        </button>

        <Toggle
          on={config.auto_trigger_enabled}
          label="Answer questions without being asked"
          title={config.auto_trigger_enabled ? "Answering on its own. Click to turn off." : "Not answering on its own. Click to turn on."}
          onClick={onToggleAutoTrigger}
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </Toggle>
        <Toggle
          on={config.live_ocr_enabled === true}
          label="Read the screen during the interview"
          title={config.live_ocr_enabled ? "Reading the screen at intervals (Ctrl+Shift+O)" : "Not reading the screen (Ctrl+Shift+O)"}
          onClick={onToggleLiveOcr}
        >
          <Monitor className="h-4 w-4" aria-hidden="true" />
        </Toggle>
        <Toggle
          on={config.anti_capture_enabled}
          label="Hide from screen capture"
          title={config.anti_capture_enabled ? "Hidden from screen sharing and recording" : "Visible in screen sharing and recording"}
          onClick={onToggleAntiCapture}
        >
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        </Toggle>

        <span className="mx-1 h-4 w-px bg-g-line" aria-hidden="true" />

        <button type="button" onClick={onOpenSettings} aria-label="Settings" title="Settings (Ctrl+,)" className={`${ICON} text-g-muted hover:text-g-text`}>
          <Settings className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={onToggleCompactPill} aria-label="Shrink to a small bar" title="Shrink to a small bar" className={`${ICON} text-g-muted hover:text-g-text`}>
          <Minimize2 className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => void TauriApi.minimizeWindow().catch(() => {})} aria-label="Minimize" title="Minimize" className={`${ICON} text-g-muted hover:text-g-text`}>
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => void close()} aria-label="Close GhostCue" title="Close GhostCue" className={`${ICON} text-g-muted hover:text-g-danger`}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
};
