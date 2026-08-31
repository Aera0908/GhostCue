import React, { useState } from "react";
import { Sparkles, Code2, HelpCircle, Layers, Square, Send } from "lucide-react";

interface ActionControlsProps {
  isStreaming: boolean;
  onTriggerAction: (action: string, customQuery?: string) => void;
  onCancel: () => void;
  bgOpacity?: number;
}

export const ActionControls: React.FC<ActionControlsProps> = ({
  isStreaming,
  onTriggerAction,
  onCancel,
  bgOpacity = 0.94,
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
    <div
      style={{ backgroundColor: `rgba(18, 18, 18, ${Math.min(1, bgOpacity + 0.05)})` }}
      className="flex flex-col gap-2 p-2.5 border-t border-[#252525] select-none font-sans"
    >
      {/* Action Buttons Row */}
      <div className="flex items-center gap-1.5">
        {/* Instant Answer */}
        <button
          type="button"
          onClick={() => onTriggerAction("hint")}
          disabled={isStreaming}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-[#252525] hover:bg-[#333333] text-white text-xs font-bold transition-colors disabled:opacity-40"
          title="Generate instant answer (Ctrl+Shift+Space)"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#facc15]" />
          <span>Answer</span>
          <span className="hidden xl:inline text-[10px] text-[#888888] font-mono ml-1">⌃⇧␣</span>
        </button>

        {/* Code Solution */}
        <button
          type="button"
          onClick={() => onTriggerAction("code")}
          disabled={isStreaming}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-[#252525] hover:bg-[#333333] text-white text-xs font-bold transition-colors disabled:opacity-40"
          title="Generate code & solution (Ctrl+Shift+K)"
        >
          <Code2 className="w-3.5 h-3.5 text-[#38bdf8]" />
          <span>Code</span>
          <span className="hidden xl:inline text-[10px] text-[#888888] font-mono ml-1">⌃⇧K</span>
        </button>

        {/* Clarifying Questions */}
        <button
          type="button"
          onClick={() => onTriggerAction("clarify")}
          disabled={isStreaming}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-[#252525] hover:bg-[#333333] text-white text-xs font-bold transition-colors disabled:opacity-40"
          title="Questions to ask the interviewer (Ctrl+Shift+L)"
        >
          <HelpCircle className="w-3.5 h-3.5 text-[#c084fc]" />
          <span>Ask Question</span>
          <span className="hidden xl:inline text-[10px] text-[#888888] font-mono ml-1">⌃⇧L</span>
        </button>

        {/* Deep Dive */}
        <button
          type="button"
          onClick={() => onTriggerAction("elaborate")}
          disabled={isStreaming}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-[#252525] hover:bg-[#333333] text-white text-xs font-bold transition-colors disabled:opacity-40"
          title="Deep dive & architectural trade-offs (Ctrl+Shift+E)"
        >
          <Layers className="w-3.5 h-3.5 text-[#4ade80]" />
          <span>Explain More</span>
          <span className="hidden xl:inline text-[10px] text-[#888888] font-mono ml-1">⌃⇧E</span>
        </button>

        {/* Stop Button */}
        {isStreaming && (
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 py-1.5 px-3 bg-[#3f1c1c] hover:bg-[#522424] text-[#fca5a5] text-xs font-bold transition-colors animate-pulse"
            title="Stop generation (Esc)"
          >
            <Square className="w-3 h-3 fill-current" />
            <span>Stop</span>
          </button>
        )}
      </div>

      {/* Manual Prompt Input Bar */}
      <form onSubmit={handleSubmitCustom} className="flex items-center gap-1.5">
        {/* Mode Selector */}
        <select
          value={selectedActionType}
          onChange={(e) => setSelectedActionType(e.target.value)}
          className="px-2 py-1.5 text-xs bg-[#1f1f1f] text-white border border-[#303030] focus:outline-none cursor-pointer font-medium"
        >
          <option value="hint">Answer</option>
          <option value="code">Code</option>
          <option value="clarify">Question</option>
          <option value="elaborate">Deep Dive</option>
        </select>

        {/* Query Input */}
        <input
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          placeholder="Ask AI anything or paste a problem (e.g. 'Tell me about yourself')..."
          className="flex-1 px-3 py-1.5 text-xs bg-[#0a0a0a] text-white placeholder-[#777777] border border-[#2a2a2a] focus:outline-none focus:border-[#555555]"
        />

        {/* Send Button */}
        <button
          type="submit"
          disabled={!customInput.trim() || isStreaming}
          className="flex items-center gap-1 px-3 py-1.5 bg-[#2a2a2a] hover:bg-[#3a3a3a] disabled:opacity-30 text-white text-xs font-bold transition-colors"
          title="Send (Enter)"
        >
          <Send className="w-3 h-3" />
          <span>Send</span>
        </button>
      </form>
    </div>
  );
};
