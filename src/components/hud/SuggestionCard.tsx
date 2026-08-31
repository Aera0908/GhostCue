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
  bgOpacity?: number;
}

export const SuggestionCard: React.FC<SuggestionCardProps> = ({
  content,
  isStreaming,
  activeAction,
  provider,
  model,
  error,
  onRetry,
  bgOpacity = 0.94,
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
        return "Code & Solution";
      case "clarify":
        return "Questions to Ask Interviewer";
      case "elaborate":
        return "Deep Dive & Trade-Offs";
      default:
        return "Suggested Answer";
    }
  };

  return (
    <div
      style={{
        backgroundColor: error
          ? `rgba(40, 16, 16, ${Math.min(1, bgOpacity + 0.08)})`
          : `rgba(12, 12, 12, ${bgOpacity})`,
      }}
      className="flex flex-col select-none transition-colors font-sans h-full"
    >
      {/* Card Header */}
      <div
        style={{ backgroundColor: `rgba(22, 22, 22, ${Math.min(1, bgOpacity + 0.05)})` }}
        className="flex items-center justify-between px-3 py-1.5 text-xs select-none border-b border-[#252525]"
      >
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-white font-bold">
            {activeAction === "code" ? (
              <Code2 className={`w-3.5 h-3.5 ${isStreaming ? "animate-spin text-[#38bdf8]" : "text-[#38bdf8]"}`} />
            ) : (
              <Sparkles className={`w-3.5 h-3.5 ${isStreaming ? "animate-spin text-[#facc15]" : "text-[#facc15]"}`} />
            )}
            <span>{getActionLabel(activeAction)}</span>
          </div>

          <span className="hidden sm:inline-flex text-[11px] font-mono px-1.5 py-0.5 bg-[#252525] text-[#999999]">
            {provider}/{model}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {content && (
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-0.5 bg-[#252525] hover:bg-[#353535] text-white text-xs font-semibold transition-colors"
              title="Copy entire response"
            >
              {copied ? <Check className="w-3 h-3 text-[#4ade80]" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 bg-[#252525] hover:bg-[#353535] text-[#aaaaaa] hover:text-white transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div
        className={`p-3 text-sm sm:text-base text-white overflow-y-auto leading-relaxed select-text scrollbar-thin scrollbar-thumb-[#333333] ${
          isExpanded ? "max-h-[580px]" : "max-h-[360px]"
        }`}
      >
        {error ? (
          <div className="flex items-start gap-2.5 p-3 bg-[#381818] text-[#fca5a5] text-xs border border-[#502020]">
            <AlertCircle className="w-4 h-4 text-[#f87171] shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-white">Connection Error</p>
              <p className="text-xs text-[#f87171] mt-0.5">{error}</p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 flex items-center gap-1 px-2.5 py-1 bg-[#5c2424] hover:bg-[#6e2c2c] text-white text-xs font-semibold transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Try Again</span>
              </button>
            </div>
          </div>
        ) : !content && isStreaming ? (
          <div className="flex items-center gap-2.5 text-white py-4 px-1 text-xs">
            <span className="w-2 h-2 bg-[#ffffff] animate-ping" />
            <span className="font-medium">Formulating answer in real-time...</span>
          </div>
        ) : !content ? (
          <div className="flex items-center justify-between text-[#888888] py-4 px-1 text-xs">
            <span>AI answers will appear here automatically or when you ask.</span>
            <span className="text-[11px] text-[#666666] font-mono">Ctrl+Shift+Space for Quick Hint</span>
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
