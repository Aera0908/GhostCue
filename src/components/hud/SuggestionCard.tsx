import React, { useState } from "react";
import {
  Sparkles,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  AlertCircle,
  RefreshCw,
  Code2,
  History,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  FileDown,
  Trash2,
  ArrowUpRight,
  Layers,
  FileText,
  Monitor,
  Search,
} from "lucide-react";
import { IdeCodeStudio } from "./IdeCodeStudio";
import { AiLogEntry } from "../../types/session";
import { useTranslation } from "../../i18n";

interface SuggestionCardProps {
  content: string;
  isStreaming: boolean;
  activeAction: string;
  provider: string;
  model: string;
  error: string | null;
  onRetry: () => void;
  aiLogs?: AiLogEntry[];
  selectedLogId?: string | null;
  onSelectLog?: (id: string | null) => void;
  onDeleteLog?: (id: string) => void;
  onClearLogs?: () => void;
  onExportTxt?: () => void;
}

export const SuggestionCard: React.FC<SuggestionCardProps> = ({
  content,
  isStreaming,
  activeAction,
  provider,
  model,
  error,
  onRetry,
  aiLogs = [],
  selectedLogId = null,
  onSelectLog,
  onDeleteLog,
  onClearLogs,
  onExportTxt,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showLogList, setShowLogList] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");

  const selectedLog = selectedLogId ? aiLogs.find((l) => l.id === selectedLogId) : null;
  const isViewingHistory = Boolean(selectedLog && !isStreaming);

  const displayContent = isViewingHistory && selectedLog ? selectedLog.answer : content;
  const displayAction = isViewingHistory && selectedLog ? selectedLog.action : activeAction;
  const displayProvider = isViewingHistory && selectedLog ? (selectedLog.provider || provider) : provider;
  const displayModel = isViewingHistory && selectedLog ? (selectedLog.model || model) : model;
  const displayQuestion = isViewingHistory && selectedLog ? selectedLog.query : undefined;

  const currentLogIndex = selectedLog ? aiLogs.findIndex((l) => l.id === selectedLog.id) : -1;

  const filteredLogs = aiLogs.filter((l) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      (l.query && l.query.toLowerCase().includes(q)) ||
      l.answer.toLowerCase().includes(q) ||
      l.action.toLowerCase().includes(q)
    );
  });

  const handleCopy = () => {
    if (!displayContent) return;
    const textToCopy = displayQuestion
      ? `Question: ${displayQuestion}\n\nAnswer (${displayAction}):\n${displayContent}`
      : displayContent;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrevLog = () => {
    if (aiLogs.length === 0 || !onSelectLog) return;
    if (currentLogIndex === -1) {
      if (aiLogs.length > 1) {
        onSelectLog(aiLogs[aiLogs.length - 2].id);
      } else if (aiLogs.length === 1) {
        onSelectLog(aiLogs[0].id);
      }
    } else if (currentLogIndex > 0) {
      onSelectLog(aiLogs[currentLogIndex - 1].id);
    }
  };

  const handleNextLog = () => {
    if (!onSelectLog || currentLogIndex === -1) return;
    if (currentLogIndex < aiLogs.length - 1) {
      onSelectLog(aiLogs[currentLogIndex + 1].id);
    } else {
      onSelectLog(null);
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case "code":
        return t.actions.code;
      case "ask":
      case "generic":
      case "question":
        return t.actions.ask;
      case "clarify":
        return t.actions.clarify;
      case "elaborate":
      case "deepdive":
        return t.actions.systemDesign;
      case "summary":
        return "Summary";
      case "vision":
      case "screen":
        return t.actions.screenVision;
      default:
        return t.actions.answer;
    }
  };

  const renderActionIcon = (action: string) => {
    switch (action) {
      case "code":
        return <Code2 className={`w-3.5 h-3.5 ${isStreaming ? "animate-spin text-sky-400" : "text-sky-400"}`} />;
      case "ask":
      case "generic":
      case "question":
        return <HelpCircle className={`w-3.5 h-3.5 ${isStreaming ? "animate-spin text-sky-400" : "text-sky-400"}`} />;
      case "clarify":
        return <HelpCircle className={`w-3.5 h-3.5 ${isStreaming ? "animate-spin text-purple-400" : "text-purple-400"}`} />;
      case "elaborate":
      case "deepdive":
        return <Layers className={`w-3.5 h-3.5 ${isStreaming ? "animate-spin text-emerald-400" : "text-emerald-400"}`} />;
      case "summary":
        return <FileText className={`w-3.5 h-3.5 ${isStreaming ? "animate-spin text-indigo-400" : "text-indigo-400"}`} />;
      case "vision":
        return <Monitor className={`w-3.5 h-3.5 ${isStreaming ? "animate-spin text-rose-400" : "text-rose-400"}`} />;
      default:
        return <Sparkles className={`w-3.5 h-3.5 ${isStreaming ? "animate-spin text-amber-400" : "text-amber-400"}`} />;
    }
  };

  return (
    <div
      role="region"
      aria-label="AI Assistant Answer Card"
      className="flex flex-col bg-slate-900/90 text-slate-100 font-sans h-full relative select-none rounded-b-lg border-t border-slate-800"
    >
      {/* 1. Header Bar */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-slate-850 border-b border-slate-700/80 text-xs">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 font-bold text-slate-100">
            {renderActionIcon(displayAction)}
            <span>{getActionLabel(displayAction)}</span>
          </div>

          <span className="hidden sm:inline-flex text-[11px] font-mono px-2 py-0.5 bg-slate-800 border border-slate-700 text-slate-300 rounded-md">
            {displayProvider}/{displayModel}
          </span>

          {isViewingHistory && (
            <span className="px-2 py-0.5 bg-amber-950/70 border border-amber-500/50 text-amber-300 text-[10px] font-bold rounded-md uppercase tracking-wider">
              Saved Answer #{currentLogIndex + 1}
            </span>
          )}
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-1.5">
          {/* Logs History Button */}
          {aiLogs.length > 0 && onSelectLog && (
            <button
              type="button"
              onClick={() => setShowLogList(!showLogList)}
              aria-label="Toggle answer history logs"
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors focus-visible:ring-2 focus-visible:ring-sky-400 ${
                showLogList || isViewingHistory
                  ? "bg-sky-950/80 border-sky-500/50 text-sky-300"
                  : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300 hover:text-white"
              }`}
              title="Browse all saved answers in this session"
            >
              <History className="w-3.5 h-3.5 text-sky-400" />
              <span>Logs ({aiLogs.length})</span>
            </button>
          )}

          {/* Copy Button */}
          {displayContent && (
            <button
              type="button"
              onClick={handleCopy}
              aria-label={copied ? t.common.copied : t.common.copy}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-sky-400"
              title={t.suggestion.copyFullAnswer}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? t.common.copied : t.common.copy}</span>
            </button>
          )}

          {/* Export TXT */}
          {onExportTxt && (
            <button
              type="button"
              onClick={onExportTxt}
              aria-label="Export interview transcript and answers"
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-400 hover:text-sky-300 text-xs font-semibold rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-sky-400"
              title="Export complete session to .txt"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>
          )}

          {/* Expand Toggle */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-label={isExpanded ? "Collapse card" : "Expand card"}
            className="p-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-sky-400"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* 2. History Stepper Sub-Bar */}
      {aiLogs.length > 0 && onSelectLog && (
        <div className="flex items-center justify-between px-3.5 py-1 bg-slate-950/80 border-b border-slate-800 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrevLog}
              disabled={currentLogIndex === 0}
              aria-label="Previous answer"
              className="p-0.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 rounded transition-colors"
              title="Previous saved answer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <span className="font-mono text-slate-200 text-xs px-1 font-semibold">
              {isViewingHistory ? `Answer ${currentLogIndex + 1} of ${aiLogs.length}` : `Live / Latest (${aiLogs.length})`}
            </span>

            <button
              type="button"
              onClick={handleNextLog}
              disabled={!isViewingHistory}
              aria-label="Next answer"
              className="p-0.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 rounded transition-colors"
              title="Next saved answer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {isViewingHistory ? (
              <button
                type="button"
                onClick={() => onSelectLog(null)}
                className="flex items-center gap-1 px-2 py-0.5 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/50 text-emerald-300 font-bold text-[10px] rounded tracking-wide transition-colors"
              >
                <span>Jump to Latest</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            ) : isStreaming ? (
              <div className="flex items-center gap-1.5 text-sky-400 font-medium text-[11px]">
                <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-ping" />
                <span>{t.suggestion.generatingStream}</span>
              </div>
            ) : (
              <span className="text-slate-400 font-mono text-[11px]">
                Auto-saved ({aiLogs.length} entries)
              </span>
            )}
          </div>
        </div>
      )}

      {/* 3. Searchable Popout Logs Drawer */}
      {showLogList && aiLogs.length > 0 && onSelectLog && (
        <div
          role="dialog"
          aria-label="Saved answers history list"
          className="absolute top-16 left-0 right-0 max-h-72 overflow-y-auto z-30 bg-slate-900 border border-slate-700 rounded-b-xl shadow-2xl p-3 space-y-2 scrollbar-thin"
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-700 text-xs">
            <span className="font-bold text-slate-100">Session Answer History</span>
            <div className="flex items-center gap-2">
              {onClearLogs && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Clear all saved AI answers for this session?")) {
                      onClearLogs();
                      setShowLogList(false);
                    }
                  }}
                  className="flex items-center gap-1 text-rose-400 hover:text-rose-300 text-xs font-semibold"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear All</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowLogList(false)}
                className="text-slate-400 hover:text-white p-0.5 rounded"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Search Filter */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search past answers or questions..."
              className="w-full pl-8 pr-3 py-1 bg-slate-950 text-slate-200 placeholder-slate-400 border border-slate-700 rounded-lg text-xs focus:outline-none focus:border-sky-400"
            />
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
            {filteredLogs.length === 0 ? (
              <div className="text-center text-xs text-slate-400 py-3">No matching answers found.</div>
            ) : (
              filteredLogs.map((log) => {
                const isSelected = selectedLogId === log.id;
                return (
                  <div
                    key={log.id}
                    className={`flex items-start justify-between p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                      isSelected
                        ? "bg-slate-800 border-sky-500/80 text-white font-medium"
                        : "bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800/50"
                    }`}
                    onClick={() => {
                      onSelectLog(log.id);
                      setShowLogList(false);
                    }}
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono mb-0.5">
                        <span className="font-bold uppercase text-sky-400">{log.action}</span>
                        <span>•</span>
                        <span>{log.timestamp}</span>
                      </div>
                      {log.query && (
                        <p className="text-slate-200 font-medium truncate text-xs mb-0.5">
                          "{log.query}"
                        </p>
                      )}
                      <p className="text-slate-400 line-clamp-2 text-[11px] leading-normal">
                        {log.answer}
                      </p>
                    </div>

                    {onDeleteLog && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteLog(log.id);
                        }}
                        className="text-slate-400 hover:text-rose-400 p-1 transition-colors"
                        title="Delete entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 4. Question Context Callout */}
      {displayQuestion && (
        <div className="px-3.5 py-2.5 bg-sky-950/40 border-b border-sky-800/40 flex items-start gap-2 text-xs">
          <HelpCircle className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider block">
              {t.suggestion.interviewerPrompt}
            </span>
            <p className="text-slate-100 font-medium select-text leading-relaxed mt-0.5">
              "{displayQuestion}"
            </p>
          </div>
        </div>
      )}

      {/* 5. Main Answer Body */}
      <div
        role="log"
        aria-live="polite"
        className={`p-3.5 text-slate-100 overflow-y-auto leading-relaxed select-text scrollbar-thin ${
          isExpanded ? "max-h-[580px]" : "max-h-[360px]"
        }`}
      >
        {error ? (
          <div className="flex items-start gap-3 p-3.5 bg-rose-950/60 border border-rose-600/60 rounded-lg text-rose-200 text-xs">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-slate-100">LLM Generation Error</p>
              <p className="text-xs text-rose-300 mt-0.5 leading-normal">{error}</p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-2.5 flex items-center gap-1.5 px-3 py-1 bg-rose-800 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-rose-400"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Try Again</span>
              </button>
            </div>
          </div>
        ) : !displayContent && isStreaming ? (
          <div className="flex items-center gap-3 text-slate-200 py-6 px-2 text-xs">
            <span className="w-2.5 h-2.5 bg-sky-400 rounded-full animate-ping" />
            <span className="font-semibold text-sky-300">{t.suggestion.generatingStream}</span>
          </div>
        ) : !displayContent ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-slate-400 py-6 px-2 text-xs gap-2">
            <span>{t.suggestion.emptySubtitle}</span>
            <span className="text-[11px] text-slate-400 font-mono bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
              Ctrl+Shift+Space for Instant Answer
            </span>
          </div>
        ) : (
          <IdeCodeStudio
            content={displayContent}
            isStreaming={isStreaming && !isViewingHistory}
            activeAction={displayAction}
          />
        )}
      </div>
    </div>
  );
};
