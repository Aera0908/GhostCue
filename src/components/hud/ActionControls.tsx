import React, { useState } from "react";
import { Sparkles, Code2, HelpCircle, Layers, Square, Send } from "lucide-react";

interface ActionControlsProps {
  isStreaming: boolean;
  onTriggerAction: (action: string, customQuery?: string) => void;
  onCancel: () => void;
}

export const ActionControls: React.FC<ActionControlsProps> = ({
  isStreaming,
  onTriggerAction,
  onCancel,
}) => {
  const [customInput, setCustomInput] = useState("");
  const [selectedActionType, setSelectedActionType] = useState<string>("hint");

  const handleSubmitCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim() || isStreaming) return;
    onTriggerAction(selectedActionType, customInput.trim());
    setCustomInput("");
  };

  return (
    <div className="flex flex-col gap-2 p-2 bg-slate-950/80 border-t border-white/5 rounded-b-xl">
      {/* Quick Action Button Row */}
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {/* Instant Hint Button */}
        <button
          type="button"
          onClick={() => onTriggerAction("hint")}
          disabled={isStreaming}
          className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-950/70 hover:bg-sky-900/80 border border-sky-600/40 text-sky-200 text-xs font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-50"
          title="Analyze latest question and generate direct answer (Ctrl+Shift+Space)"
        >
          <Sparkles className="w-3.5 h-3.5 text-sky-400" />
          <span>Hint</span>
          <kbd className="hidden lg:inline text-[9px] font-mono px-1 py-0.2 rounded bg-sky-900/80 text-sky-300 ml-0.5">
            ⌃⇧␣
          </kbd>
        </button>

        {/* Code Solution Button */}
        <button
          type="button"
          onClick={() => onTriggerAction("code")}
          disabled={isStreaming}
          className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/60 text-slate-200 text-xs font-medium transition-all active:scale-95 disabled:opacity-50"
          title="Generate clean code snippet in IDE layout with time/space complexity (Ctrl+Shift+K)"
        >
          <Code2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Code IDE</span>
          <kbd className="hidden lg:inline text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400 ml-0.5">
            ⌃⇧K
          </kbd>
        </button>

        {/* Clarification Questions Button */}
        <button
          type="button"
          onClick={() => onTriggerAction("clarify")}
          disabled={isStreaming}
          className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/60 text-slate-200 text-xs font-medium transition-all active:scale-95 disabled:opacity-50"
          title="Generate strategic clarifying questions to ask interviewer (Ctrl+Shift+L)"
        >
          <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
          <span>Clarify</span>
          <kbd className="hidden lg:inline text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400 ml-0.5">
            ⌃⇧L
          </kbd>
        </button>

        {/* Elaborate / Deep Dive Button */}
        <button
          type="button"
          onClick={() => onTriggerAction("elaborate")}
          disabled={isStreaming}
          className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/60 text-slate-200 text-xs font-medium transition-all active:scale-95 disabled:opacity-50"
          title="Generate deep architectural talking points and trade-offs (Ctrl+Shift+E)"
        >
          <Layers className="w-3.5 h-3.5 text-purple-400" />
          <span>Deep Dive</span>
          <kbd className="hidden lg:inline text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400 ml-0.5">
            ⌃⇧E
          </kbd>
        </button>

        {/* Cancel Streaming Button */}
        {isStreaming && (
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-600/40 text-rose-300 text-xs font-semibold shadow-sm animate-pulse"
            title="Stop generation (Esc)"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Stop</span>
          </button>
        )}
      </div>

      {/* Manual Prompt Input Bar */}
      <form onSubmit={handleSubmitCustom} className="flex items-center gap-1.5">
        {/* Mode Selector for Custom Query */}
        <select
          value={selectedActionType}
          onChange={(e) => setSelectedActionType(e.target.value)}
          className="px-2 py-1 text-[11px] font-mono bg-slate-900 border border-white/10 rounded-md text-sky-300 focus:outline-none focus:border-sky-500 cursor-pointer"
        >
          <option value="hint">Hint</option>
          <option value="code">Code IDE</option>
          <option value="clarify">Clarify</option>
          <option value="elaborate">Deep Dive</option>
        </select>

        <input
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          placeholder="Ask AI anything specific or type a coding problem (e.g. 'Two Sum in Python')..."
          className="flex-1 px-2.5 py-1 text-xs bg-slate-900/80 border border-white/10 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500/80 focus:ring-1 focus:ring-sky-500/40"
        />

        <button
          type="submit"
          disabled={!customInput.trim() || isStreaming}
          className="flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-40 text-white text-xs font-medium rounded-md shadow-sm transition-all active:scale-95"
          title="Send query (Enter)"
        >
          <Send className="w-3 h-3" />
          <span className="hidden sm:inline">Send</span>
        </button>
      </form>
    </div>
  );
};
