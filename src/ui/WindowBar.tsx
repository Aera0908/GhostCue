import React from "react";
import { Minus, X } from "lucide-react";
import { TauriApi } from "../services/tauriApi";

interface WindowBarProps {
  title: string;
  /** Extra controls, placed before minimize and close. */
  children?: React.ReactNode;
}

const ICON_BUTTON =
  "grid h-7 w-7 place-items-center rounded-md text-g-muted hover:bg-g-hover hover:text-g-text active:bg-g-base " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-g-accent";

/** The window has no system frame, so this strip is how it is moved, minimized and closed. */
export const WindowBar: React.FC<WindowBarProps> = ({ title, children }) => (
  <div
    className="flex h-10 shrink-0 cursor-default items-center gap-2 border-b border-g-line bg-g-base pl-4 pr-2"
    onMouseDown={(event) => {
      const target = event.target as HTMLElement;
      if (event.button !== 0 || target.closest("button, a, input, select, textarea")) return;
      void TauriApi.startDragging().catch(() => {});
    }}
  >
    <img src="/GhostCue_icon.png" alt="" className="h-4 w-4 rounded-sm" draggable={false} />
    <span className="text-[13px] font-medium text-g-text">{title}</span>
    <div className="ml-auto flex items-center gap-1">
      {children}
      <button type="button" aria-label="Minimize" className={ICON_BUTTON} onClick={() => void TauriApi.minimizeWindow().catch(() => {})}>
        <Minus className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Close GhostCue"
        className={`${ICON_BUTTON} hover:text-g-danger`}
        onClick={() => void TauriApi.exitApp().catch(() => {})}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  </div>
);
