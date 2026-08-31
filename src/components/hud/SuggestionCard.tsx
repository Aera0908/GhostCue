import React, { useState } from "react";
import { Sparkles, Copy, Check, Maximize2, Minimize2, AlertCircle, RefreshCw, Code2 } from "lucide-react";
import { IdeCodeStudio } from "./IdeCodeStudio";

interface SuggestionCardProps {
  content: string;
  isStreaming: boolean;
  activeAction: string;
  provider: string;
  model: string;
  error: string | null;
  onRetry: () => void;
}

export const SuggestionCard: React.FC<SuggestionCardProps> = ({
  content,
  isStreaming,
  activeAction,
  provider,
  model,
  error,
  onRetry,
}) => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleCopy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case "code":
        return "Coding Solution & Strategy";
      case "clarify":
        return "Clarifying Questions";
      case "elaborate":
        return "Architectural Deep Dive";
      default:
        return "Instant Interview Hint";
    }
  };

  return (
    <div
      className={`flex flex-col rounded-lg border transition-all duration-200 overflow-hidden ${
        isStreaming
          ? "bg-slate-900/95 border-sky-500/50 shadow-[0_0_18px_rgba(56,189,248,0.2)]"
          : error
          ? "bg-rose-950/40 border-rose-800/50"
          : "bg-slate-900/80 border-white/10"
      }`}
    >
      {/* Card Header Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950/70 border-b border-white/5 text-[11px]">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-sky-400 font-semibold">
            {activeAction === "code" ? (
              <Code2 className={`w-3.5 h-3.5 ${isStreaming ? "animate-spin text-sky-300" : "text-sky-400"}`} />
            ) : (
              <Sparkles className={`w-3.5 h-3.5 ${isStreaming ? "animate-spin text-sky-300" : ""}`} />
            )}
            <span>{getActionLabel(activeAction)}</span>
          </div>

          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700/60">
            {provider}/{model}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {content && (
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-medium transition-colors"
              title="Copy entire response"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? "Copied" : "Copy All"}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-slate-200"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div
        className={`p-3 text-xs text-slate-100 font-sans overflow-y-auto leading-relaxed select-text scrollbar-thin scrollbar-thumb-slate-800 ${
          isExpanded ? "max-h-[500px]" : "max-h-[320px]"
        }`}
      >
        {error ? (
          <div className="flex items-start gap-2 p-2.5 rounded bg-rose-950/50 border border-rose-800/50 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">AI Generation Failed</p>
              <p className="text-[11px] text-rose-400/90 mt-0.5">{error}</p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 flex items-center gap-1 px-2 py-0.5 rounded bg-rose-900/60 hover:bg-rose-800 text-[10px] text-rose-200 font-medium"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Retry</span>
              </button>
            </div>
          </div>
        ) : !content && isStreaming ? (
          <div className="flex items-center gap-2.5 text-slate-300 py-3">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-ping" />
            <span className="text-xs font-medium text-sky-200">
              Analyzing prompt & generating real-time response...
            </span>
          </div>
        ) : !content ? (
          <div className="flex items-center justify-between text-slate-500 py-3 px-1 text-xs">
            <span className="italic">AI suggestions will appear automatically or when you type a query.</span>
            <span className="text-[10px] font-mono text-slate-600">Press Ctrl+Shift+Space to force hint</span>
          </div>
        ) : (
          <IdeCodeStudio
            content={content}
            isStreaming={isStreaming}
            activeAction={activeAction}
          />
        )}
      </div>
    </div>
  );
};
