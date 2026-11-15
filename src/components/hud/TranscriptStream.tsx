import React, { useEffect, useRef, useState } from "react";
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
  fontSize?: number;
}

export const isInterviewerQuestion = (text: string): boolean => {
  if (!text || text.trim().length < 3) return false;

  let t = text.trim().toLowerCase();
  // Strip common conversational fillers at the start of utterances (e.g. "So,", "Okay,", "Well,")
  t = t.replace(/^(so|well|and|now|okay|ok|then|next|alright)\s*[,:\-]?\s*/i, "").trim();

  const questionPrefixes = [
    "how ",
    "what ",
    "why ",
    "where ",
    "when ",
    "who ",
    "which ",
    "whose ",
    "can you ",
    "could you ",
    "would you ",
    "will you ",
    "should you ",
    "do you ",
    "did you ",
    "does ",
    "have you ",
    "has ",
    "had you ",
    "are you ",
    "is there ",
    "is it ",
    "was there ",
    "tell me ",
    "tell us ",
    "explain ",
    "describe ",
    "walk me ",
    "walk us ",
    "suppose ",
    "give me ",
    "give us ",
    "write ",
    "implement ",
    "design ",
    "create ",
    "build ",
    "solve ",
    "find ",
    "please explain",
    "please tell",
    "please describe",
    "let's talk about",
    "let's discuss",
    "share an example",
    "give an example",
  ];

  const checkPhrase = (phrase: string): boolean => {
    const p = phrase.trim().toLowerCase().replace(/^(so|well|and|now|okay|ok|then|next|alright)\s*[,:\-]?\s*/i, "").trim();
    if (p.includes("?")) return true;
    return questionPrefixes.some((prefix) => p.startsWith(prefix));
  };

  if (checkPhrase(t)) return true;

  // Check individual sentences if speech-to-text broke utterance into multiple sentences
  const sentences = t.split(/[.!]\s+/);
  if (sentences.length > 1) {
    for (const sentence of sentences) {
      if (checkPhrase(sentence)) {
        return true;
      }
    }
  }

  return false;
};

export const TranscriptStream: React.FC<TranscriptStreamProps> = ({
  transcripts,
  onClear,
  onAskAiAboutTurn,
  aiLogs = [],
  onSelectAiAnswer,
  onExportTxt,
  fontSize = 14,
}) => {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

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

  const handleExport = async () => {
    if (!onExportTxt || isExporting) return;
    setIsExporting(true);
    try {
      await onExportTxt();
    } finally {
      setIsExporting(false);
    }
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

  const quiet =
    "rounded px-1.5 py-0.5 text-xs text-g-muted hover:bg-g-hover hover:text-g-text active:bg-g-base " +
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-g-accent";

  return (
    <div role="region" aria-label="Conversation" className="flex h-full select-none flex-col font-sans">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-g-line px-3 text-xs text-g-muted">
        <span>
          {t.transcript.headerTitle}
          {transcripts.length > 0 && <span className="ml-1.5 tabular-nums">{transcripts.length}</span>}
        </span>

        <div className="flex items-center gap-1">
          {!autoScroll && (
            <button
              type="button"
              className={quiet}
              onClick={() => {
                setAutoScroll(true);
                if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              }}
            >
              Jump to latest
            </button>
          )}
          {onExportTxt && (transcripts.length > 0 || aiLogs.length > 0) && (
            <button type="button" className={`${quiet} disabled:opacity-40`} onClick={handleExport} disabled={isExporting}>
              {isExporting ? "Saving" : "Export"}
            </button>
          )}
          {transcripts.length > 0 && (
            <button type="button" className={`${quiet} hover:text-g-danger`} onClick={onClear} title={t.transcript.clearHistory}>
              {t.common.clear}
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} onScroll={handleScroll} role="log" aria-live="polite" className="flex-1 overflow-y-auto px-3 py-2">
        {transcripts.length === 0 ? (
          <div className="flex h-full flex-col justify-center px-1 py-6">
            <p className="text-sm text-g-text">{t.transcript.emptyWaiting}</p>
            <p className="mt-1 max-w-prose text-[13px] leading-5 text-g-muted">{t.transcript.emptySubtitle}</p>
          </div>
        ) : (
          <ol className="space-y-2.5">
            {transcripts.map((turn) => {
              const isInterviewer = turn.speaker === "Interviewer";
              const speakerLabel = isInterviewer ? t.transcript.speakerInterviewer : t.transcript.speakerCandidate;
              const isQuestion = isInterviewer && isInterviewerQuestion(turn.text);
              const matchedLog = findMatchingLog(turn.text);

              return (
                <li key={turn.id} className="group">
                  <div className="flex h-5 items-center gap-2 text-xs">
                    <span className={isInterviewer ? "font-medium text-g-accent" : "font-medium text-g-muted"}>{speakerLabel}</span>
                    <span className="font-mono tabular-nums text-g-muted/70">{turn.timestamp}</span>
                    <span className="ml-auto flex items-center gap-1 opacity-0 focus-within:opacity-100 group-hover:opacity-100">
                      {matchedLog && onSelectAiAnswer && (
                        <button type="button" className={quiet} onClick={() => onSelectAiAnswer(matchedLog.id)}>
                          Show answer
                        </button>
                      )}
                      <button type="button" className={quiet} onClick={() => onAskAiAboutTurn(turn.text)}>
                        {matchedLog ? "Answer again" : "Answer this"}
                      </button>
                      <button type="button" className={quiet} onClick={() => copyToClipboard(turn.id, turn.text)}>
                        {copiedId === turn.id ? t.common.copied : t.common.copy}
                      </button>
                    </span>
                  </div>
                  <p
                    className={`select-text whitespace-pre-wrap leading-relaxed ${isQuestion || !isInterviewer ? "text-g-text" : "text-g-text/80"}`}
                    style={{ fontSize: `${fontSize}px` }}
                  >
                    {turn.text}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
};
