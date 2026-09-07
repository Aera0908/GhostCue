import React, { useState } from "react";
import { Sparkles, Code2, Layers, Square, Send, FileText, Monitor, HelpCircle as QuestionIcon } from "lucide-react";
import { useTranslation } from "../../i18n";

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
  const { t } = useTranslation();
  const [customInput, setCustomInput] = useState("");
  const [selectedActionType, setSelectedActionType] = useState<string>("hint");

  const presetActions = [
    {
      id: "hint",
      label: t.actions.answer,
      desc: `${t.actions.answerDesc} (Ctrl+Shift+Space)`,
      icon: Sparkles,
      color: "text-amber-400",
    },
    {
      id: "code",
      label: t.actions.code,
      desc: `${t.actions.codeDesc} (Ctrl+Shift+K)`,
      icon: Code2,
      color: "text-sky-400",
    },
    {
      id: "clarify",
      label: t.actions.clarify,
      desc: `${t.actions.clarifyDesc} (Ctrl+Shift+L)`,
      icon: QuestionIcon,
      color: "text-purple-400",
    },
    {
      id: "elaborate",
      label: t.actions.systemDesign,
      desc: `${t.actions.systemDesignDesc} (Ctrl+Shift+E)`,
      icon: Layers,
      color: "text-emerald-400",
    },
    {
      id: "summary",
      label: t.actions.summary,
      desc: `${t.actions.summaryDesc} (Ctrl+Shift+U)`,
      icon: FileText,
      color: "text-indigo-400",
    },
    {
      id: "vision",
      label: t.actions.screenVision,
      desc: `${t.actions.screenVisionDesc} (Ctrl+Shift+S)`,
      icon: Monitor,
      color: "text-rose-400",
    },
  ];

  const handleSubmitCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim() || isStreaming) return;
    onTriggerAction(selectedActionType, customInput.trim());
    setCustomInput("");
  };

  return (
    <div
      role="region"
      aria-label="AI Prompt Actions and Query Bar"
      className="flex flex-col gap-2 p-3 bg-slate-900/95 border-t border-slate-800 select-none font-sans"
    >
      {/* Quick Action Preset Chips */}
      <div className="flex items-center gap-2 w-full">
        {presetActions.map((preset) => {
          const Icon = preset.icon;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onTriggerAction(preset.id)}
              disabled={isStreaming}
              aria-label={preset.desc}
              className="flex-1 min-w-0 h-9 px-2 flex items-center justify-center gap-1.5 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 text-slate-100 text-xs font-semibold rounded-lg shadow-sm transition-all disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-sky-400"
              title={preset.desc}
            >
              <Icon className={`w-3.5 h-3.5 shrink-0 ${preset.color}`} />
              <span className="truncate whitespace-nowrap">{preset.label}</span>
            </button>
          );
        })}

        {/* Cancel Generation Button */}
        {isStreaming && (
          <button
            type="button"
            onClick={onCancel}
            aria-label={t.actions.stopAi}
            className="h-9 px-3 flex items-center justify-center gap-1.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-500/50 text-rose-200 text-xs font-bold rounded-lg transition-colors animate-pulse shrink-0"
            title={`${t.actions.stopAi} (Esc)`}
          >
            <Square className="w-3 h-3 fill-current shrink-0" />
            <span>Stop</span>
          </button>
        )}
      </div>

      {/* Manual Prompt Input Bar */}
      <form onSubmit={handleSubmitCustom} className="flex items-center gap-2">
        {/* Category Mode Selector */}
        <select
          value={selectedActionType}
          onChange={(e) => setSelectedActionType(e.target.value)}
          aria-label="Response generation style"
          className="px-2.5 py-1.5 text-xs bg-slate-800 text-slate-100 border border-slate-700 rounded-lg focus-visible:ring-2 focus-visible:ring-sky-400 cursor-pointer font-medium"
        >
          <option value="hint">{t.actions.answer} ({t.actions.answerDesc})</option>
          <option value="code">{t.actions.code} ({t.actions.codeDesc})</option>
          <option value="ask">{t.actions.ask} ({t.actions.askDesc})</option>
          <option value="clarify">{t.actions.clarify} ({t.actions.clarifyDesc})</option>
          <option value="elaborate">{t.actions.systemDesign} ({t.actions.systemDesignDesc})</option>
          <option value="summary">Summary</option>
          <option value="vision">{t.actions.screenVision}</option>
        </select>

        {/* Text Input */}
        <div className="relative flex-1">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            aria-label="Enter question or prompt for AI"
            placeholder={t.actions.queryPlaceholder}
            className="w-full px-3 py-1.5 text-xs bg-slate-950 text-slate-100 placeholder-slate-400 border border-slate-700 rounded-lg focus:outline-none focus:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400"
          />
        </div>

        {/* Send Button */}
        <button
          type="submit"
          disabled={!customInput.trim() || isStreaming}
          aria-label={t.actions.sendPrompt}
          className="flex items-center gap-1 px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-xs font-bold rounded-lg shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-sky-400"
          title={`${t.actions.sendPrompt} (Enter)`}
        >
          <Send className="w-3 h-3" />
          <span>{t.actions.sendPrompt.split(" ")[0]}</span>
        </button>
      </form>
    </div>
  );
};
