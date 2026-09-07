import React, { useEffect, useRef, useState } from "react";
import { Copy, Trash2, ArrowDown, Sparkles, User, Headphones, Check, HelpCircle, FileText } from "lucide-react";
import { TranscriptSegment } from "../../types/transcript";
import { AiLogEntry } from "../../types/session";
import { useTranslation } from "../../i18n";

interface TranscriptStreamProps {
  transcripts: TranscriptSegment[];
  onClear: () => void;
  onAskAiAboutTurn: (text: string) => void;
  autoTriggerEnabled?: boolean;
  onToggleAutoTrigger?: () => void;
  aiLogs?: AiLogEntry[];
  onSelectAiAnswer?: (logId: string) => void;
  onExportTxt?: () => void;
}

export const isInterviewerQuestion = (text: string): boolean => {
  const t = text.trim().toLowerCase();
  return (
    t.includes("?") ||
    t.startsWith("how ") ||
    t.startsWith("what ") ||
    t.startsWith("why ") ||
    t.startsWith("can you ") ||
    t.startsWith("could you ") ||
    t.startsWith("tell me ") ||
    t.startsWith("explain ") ||
    t.startsWith("describe ") ||
    t.startsWith("walk me ") ||
    t.startsWith("suppose ") ||
    t.startsWith("give me ") ||
    t.startsWith("write ") ||
    t.startsWith("implement ") ||
    t.startsWith("design ")
  );
};

export const TranscriptStream: React.FC<TranscriptStreamProps> = ({
  transcripts,
  onClear,
  onAskAiAboutTurn,
  autoTriggerEnabled = true,
  onToggleAutoTrigger,
  aiLogs = [],
  onSelectAiAnswer,
  onExportTxt,
}) => {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts, autoScroll]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(isAtBottom);
  };

  const copyToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const findMatchingLog = (turnText: string) => {
    if (!aiLogs || aiLogs.length === 0) return null;
    const cleanTurn = turnText.trim().toLowerCase();
    return aiLogs.find((l) => {
      if (!l.query) return false;
      const cleanQ = l.query.trim().toLowerCase();
      return cleanTurn.includes(cleanQ) || cleanQ.includes(cleanTurn);
    });
  };

  return (
    <div
      role="region"
      aria-label="Live conversation transcripts"
      className="flex flex-col h-full select-none font-sans bg-slate-900/90 rounded-b-lg border-t border-slate-800"
    >
      {/* Stream Header */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-slate-850 border-b border-slate-700/80 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <span className="text-slate-100 font-bold">{t.transcript.headerTitle}</span>
          <span className="text-slate-400 font-mono font-medium">({transcripts.length})</span>
        </div>

        <div className="flex items-center gap-1.5">
          {onToggleAutoTrigger && (
            <button
              type="button"
              onClick={onToggleAutoTrigger}
              aria-label="Toggle auto answer generation"
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors focus-visible:ring-2 focus-visible:ring-sky-400 ${
                autoTriggerEnabled
                  ? "bg-sky-950/80 border-sky-500/50 text-sky-300"
                  : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
              }`}
              title="Toggle automatic AI answer generation when questions are detected"
            >
              <Sparkles className={`w-3.5 h-3.5 ${autoTriggerEnabled ? "text-sky-400" : "text-slate-400"}`} />
              <span>Auto: {autoTriggerEnabled ? t.common.on : t.common.off}</span>
            </button>
          )}

          {!autoScroll && (
            <button
              type="button"
              onClick={() => {
                setAutoScroll(true);
                if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              }}
              aria-label="Scroll to bottom"
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 rounded-lg transition-colors text-xs font-medium"
            >
              <ArrowDown className="w-3.5 h-3.5" />
              <span>Scroll</span>
            </button>
          )}

          {onExportTxt && transcripts.length > 0 && (
            <button
              type="button"
              onClick={onExportTxt}
              aria-label="Export conversation transcripts to text file"
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-400 hover:text-sky-300 rounded-lg transition-colors text-xs font-medium"
              title="Export transcripts to .txt"
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>
          )}

          {transcripts.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              aria-label={t.transcript.clearHistory}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-rose-950 border border-slate-700 hover:border-rose-500/40 text-slate-400 hover:text-rose-300 rounded-lg transition-colors text-xs font-medium"
              title={t.transcript.clearHistory}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t.common.clear}</span>
            </button>
          )}
        </div>
      </div>

      {/* Transcript Scroll Area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        className="flex-1 p-3.5 space-y-3 overflow-y-auto text-sm scrollbar-thin"
      >
        {transcripts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 py-8 px-4">
            <p className="font-semibold text-slate-200 text-xs sm:text-sm">{t.transcript.emptyWaiting}</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              {t.transcript.emptySubtitle}
            </p>
          </div>
        ) : (
          transcripts.map((turn) => {
            const isInterviewer = turn.speaker === "Interviewer";
            const speakerLabel = isInterviewer ? t.transcript.speakerInterviewer : t.transcript.speakerCandidate;
            const isQuestion = isInterviewer && isInterviewerQuestion(turn.text);
            const matchedLog = isInterviewer ? findMatchingLog(turn.text) : null;

            return (
              <div
                key={turn.id}
                className={`group relative flex flex-col p-3 rounded-xl border transition-all ${
                  isQuestion
                    ? "bg-sky-950/40 border-sky-600/50 shadow-sm text-slate-100"
                    : isInterviewer
                    ? "bg-slate-900 border-slate-700/80 text-slate-100"
                    : "bg-slate-950/70 border-slate-800 text-slate-100"
                }`}
              >
                {/* Speaker Header */}
                <div className="flex items-center justify-between mb-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    {isInterviewer ? (
                      <Headphones className="w-4 h-4 text-sky-400" />
                    ) : (
                      <User className="w-4 h-4 text-emerald-400" />
                    )}
                    <span
                      className={`font-bold ${
                        isInterviewer ? "text-sky-300" : "text-emerald-300"
                      }`}
                    >
                      {speakerLabel}
                    </span>

                    {/* Question Detected Badge */}
                    {isQuestion && (
                      <span className="px-2 py-0.5 bg-sky-950/80 border border-sky-500/60 text-sky-200 text-[10px] font-bold rounded-md flex items-center gap-1 uppercase tracking-wider">
                        <HelpCircle className="w-3 h-3" />
                        <span>Question</span>
                      </span>
                    )}

                    {/* Saved Answer Badge */}
                    {matchedLog && (
                      <span className="hidden sm:inline-flex px-2 py-0.5 bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-[10px] font-bold rounded-md items-center gap-1 uppercase tracking-wider">
                        <Check className="w-3 h-3" />
                        <span>Saved</span>
                      </span>
                    )}

                    <span className="text-slate-400 font-mono text-[11px]">{turn.timestamp}</span>
                  </div>

                  {/* Actions on hover */}
                  <div className="flex items-center gap-1.5">
                    {matchedLog && onSelectAiAnswer && (
                      <button
                        type="button"
                        onClick={() => onSelectAiAnswer(matchedLog.id)}
                        className="flex items-center gap-1 px-2.5 py-0.5 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/60 text-emerald-300 text-xs font-semibold rounded-md transition-colors"
                        title="View saved AI answer for this question"
                      >
                        <FileText className="w-3 h-3" />
                        <span>View</span>
                      </button>
                    )}

                    {isInterviewer && (
                      <button
                        type="button"
                        onClick={() => onAskAiAboutTurn(turn.text)}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center gap-1 px-2.5 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-400 hover:text-sky-300 text-xs font-semibold rounded-md transition-all"
                        title="Generate suggested answer for this question"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>{matchedLog ? "Re-answer" : "Answer"}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => copyToClipboard(turn.id, turn.text)}
                      aria-label="Copy transcript text"
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded transition-all"
                      title={t.common.copy}
                    >
                      {copiedId === turn.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Speech Text */}
                <p className="leading-relaxed text-sm text-slate-100 whitespace-pre-wrap font-normal select-text">
                  {turn.text}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
