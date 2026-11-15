import React, { useState } from "react";
import { IdeCodeStudio } from "./IdeCodeStudio";
import { AiLogEntry } from "../../types/session";
import { useTranslation } from "../../i18n";
import { Button } from "../../ui/Button";
import { Notice } from "../../ui/Notice";

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
  fontSize?: number;
  onFontSizeChange?: (size: number) => void;
}

export const SuggestionCard: React.FC<SuggestionCardProps> = ({
  content,
  isStreaming,
  activeAction,
  model,
  error,
  onRetry,
  aiLogs = [],
  selectedLogId = null,
  onSelectLog,
  onDeleteLog,
  onClearLogs,
  onExportTxt,
  fontSize = 14,
  onFontSizeChange,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [showLogList, setShowLogList] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const selectedLog = selectedLogId ? aiLogs.find((l) => l.id === selectedLogId) : null;
  const isViewingHistory = Boolean(selectedLog && !isStreaming);

  const displayContent = isViewingHistory && selectedLog ? selectedLog.answer : content;
  const displayAction = isViewingHistory && selectedLog ? selectedLog.action : activeAction;
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

  const handleExport = async () => {
    if (!onExportTxt || isExporting) return;
    setIsExporting(true);
    try {
      await onExportTxt();
    } finally {
      setIsExporting(false);
    }
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

  const quiet =
    "rounded px-1.5 py-0.5 text-xs text-g-muted hover:bg-g-hover hover:text-g-text active:bg-g-base disabled:opacity-40 " +
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-g-accent";

  return (
    <div role="region" aria-label="Answer" className="flex h-full min-h-0 select-none flex-col font-sans">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-g-line px-3 text-xs text-g-muted">
        <span className="font-medium text-g-text">{getActionLabel(displayAction)}</span>
        {displayModel && <span className="min-w-0 truncate font-mono">{displayModel}</span>}
        {isStreaming && !isViewingHistory && <span role="status">{t.suggestion.generatingStream}</span>}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {aiLogs.length > 0 && (
            <>
              <button type="button" className={quiet} onClick={handlePrevLog} disabled={currentLogIndex === 0} title="Earlier answer">
                Earlier
              </button>
              <button type="button" className={quiet} onClick={handleNextLog} disabled={currentLogIndex === -1} title="Later answer">
                Later
              </button>
              <button type="button" className={quiet} aria-expanded={showLogList} onClick={() => setShowLogList((open) => !open)}>
                All answers <span className="tabular-nums">{aiLogs.length}</span>
              </button>
            </>
          )}
          {onFontSizeChange && (
            <>
              <button type="button" className={quiet} aria-label="Smaller text" disabled={fontSize <= 12} onClick={() => onFontSizeChange(fontSize - 1)}>
                A-
              </button>
              <button type="button" className={quiet} aria-label="Larger text" disabled={fontSize >= 22} onClick={() => onFontSizeChange(fontSize + 1)}>
                A+
              </button>
            </>
          )}
          {onExportTxt && displayContent && (
            <button type="button" className={quiet} onClick={handleExport} disabled={isExporting}>
              {isExporting ? "Saving" : "Export"}
            </button>
          )}
          <button type="button" className={quiet} onClick={handleCopy} disabled={!displayContent}>
            {copied ? t.common.copied : t.common.copy}
          </button>
        </div>
      </div>

      {isViewingHistory && (
        <div className="flex h-7 shrink-0 items-center gap-2 border-b border-g-line bg-g-raised px-3 text-xs text-g-muted">
          <span>
            Earlier answer {currentLogIndex + 1} of {aiLogs.length}
          </span>
          <button type="button" className={`${quiet} ml-auto text-g-accent`} onClick={() => onSelectLog?.(null)}>
            Back to the latest
          </button>
        </div>
      )}

      {showLogList && (
        <div className="max-h-[45%] shrink-0 overflow-y-auto border-b border-g-line bg-g-raised">
          <div className="flex items-center gap-2 px-3 py-2">
            <input
              type="search"
              aria-label="Search answers"
              placeholder="Search answers"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="h-7 min-w-0 flex-1 select-text rounded-md border border-g-line bg-g-base px-2 text-xs text-g-text placeholder:text-g-muted/70 hover:border-g-lineStrong focus:border-g-accent focus:outline-none focus-visible:outline-none"
            />
            {onClearLogs && (
              <button type="button" className={`${quiet} hover:text-g-danger`} onClick={onClearLogs}>
                Delete all
              </button>
            )}
          </div>
          {filteredLogs.length === 0 ? (
            <p className="px-3 pb-3 text-xs text-g-muted">Nothing matches.</p>
          ) : (
            <ul className="divide-y divide-g-line border-t border-g-line">
              {[...filteredLogs].reverse().map((log) => (
                <li key={log.id} className="flex items-center gap-2 px-3 py-1.5">
                  <button
                    type="button"
                    aria-current={log.id === selectedLogId ? "true" : undefined}
                    onClick={() => {
                      onSelectLog?.(log.id);
                      setShowLogList(false);
                    }}
                    className="min-w-0 flex-1 rounded px-1 py-0.5 text-left hover:bg-g-hover active:bg-g-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-g-accent"
                  >
                    <span className="block truncate text-[13px] text-g-text">{log.query || log.answer.slice(0, 120)}</span>
                    <span className="block text-xs text-g-muted">
                      {getActionLabel(log.action)} · {log.timestamp}
                    </span>
                  </button>
                  {onDeleteLog && (
                    <button type="button" className={`${quiet} hover:text-g-danger`} aria-label="Delete this answer" onClick={() => onDeleteLog(log.id)}>
                      Delete
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {displayQuestion && (
        <p className="shrink-0 select-text truncate border-b border-g-line px-3 py-1.5 text-xs text-g-muted" title={displayQuestion}>
          Asked: {displayQuestion}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
        {error && !isViewingHistory ? (
          <div className="space-y-2.5 py-2">
            <Notice kind="problem" className="select-text">
              {error}
            </Notice>
            <Button size="sm" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : !displayContent && isStreaming ? (
          <p className="py-4 text-[13px] text-g-muted">{t.suggestion.generatingStream}</p>
        ) : !displayContent ? (
          <div className="py-4">
            <p className="text-sm text-g-text">{t.suggestion.emptySubtitle}</p>
            <p className="mt-1 text-[13px] text-g-muted">
              Press <span className="font-mono text-g-text">Ctrl + Shift + Space</span> to answer the last question.
            </p>
          </div>
        ) : (
          <IdeCodeStudio
            content={displayContent}
            isStreaming={isStreaming && !isViewingHistory}
            activeAction={displayAction}
            fontSize={fontSize}
          />
        )}
      </div>
    </div>
  );
};
