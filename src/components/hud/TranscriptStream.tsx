import React, { useEffect, useRef, useState } from "react";
import { Copy, Trash2, ArrowDown, Sparkles, User, Headphones, Check, HelpCircle } from "lucide-react";
import { TranscriptSegment } from "../../types/transcript";

interface TranscriptStreamProps {
  transcripts: TranscriptSegment[];
  onClear: () => void;
  onAskAiAboutTurn: (text: string) => void;
  bgOpacity?: number;
  autoTriggerEnabled?: boolean;
  onToggleAutoTrigger?: () => void;
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
  bgOpacity = 0.94,
  autoTriggerEnabled = true,
  onToggleAutoTrigger,
}) => {
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

  return (
    <div
      style={{ backgroundColor: `rgba(16, 16, 16, ${bgOpacity})` }}
      className="flex flex-col h-full select-none font-sans"
    >
      {/* Stream Header */}
      <div
        style={{ backgroundColor: `rgba(22, 22, 22, ${Math.min(1, bgOpacity + 0.05)})` }}
        className="flex items-center justify-between px-3 py-1.5 text-xs text-[#888888] border-b border-[#252525]"
      >
        <div className="flex items-center gap-2">
          <span className="text-white font-bold">Live Conversation</span>
          <span className="text-[#888888] font-mono font-medium">({transcripts.length})</span>
        </div>

        <div className="flex items-center gap-1.5">
          {onToggleAutoTrigger && (
            <button
              type="button"
              onClick={onToggleAutoTrigger}
              className={`flex items-center gap-1 px-2 py-0.5 text-xs font-semibold transition-colors ${
                autoTriggerEnabled
                  ? "bg-[#163650] border border-[#38bdf8]/60 text-[#38bdf8] hover:bg-[#1a4466]"
                  : "bg-[#242424] text-[#888888] hover:text-[#cccccc]"
              }`}
              title="Toggle automatic AI answer generation when questions are detected"
            >
              <Sparkles className={`w-3 h-3 ${autoTriggerEnabled ? "text-[#38bdf8]" : "text-[#777777]"}`} />
              <span>Auto-Answer {autoTriggerEnabled ? "ON" : "OFF"}</span>
            </button>
          )}

          {!autoScroll && (
            <button
              type="button"
              onClick={() => {
                setAutoScroll(true);
                if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              }}
              className="flex items-center gap-1 px-2 py-0.5 bg-[#242424] text-white hover:bg-[#333333] transition-colors text-xs font-medium"
            >
              <ArrowDown className="w-3 h-3" />
              <span>Scroll to Bottom</span>
            </button>
          )}

          {transcripts.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="flex items-center gap-1 px-2 py-0.5 bg-[#242424] text-[#aaaaaa] hover:text-[#f87171] hover:bg-[#331c1c] transition-colors text-xs font-medium"
              title="Clear transcript history"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Transcript List Scroll Area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 p-3 space-y-2.5 overflow-y-auto text-sm scrollbar-thin scrollbar-thumb-[#333333]"
      >
        {transcripts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-[#888888] py-6 px-4">
            <p className="font-semibold text-white text-xs">Listening for conversation...</p>
            <p className="text-xs text-[#777777] mt-1">
              Interviewer questions and your answers will show up here automatically.
            </p>
          </div>
        ) : (
          transcripts.map((turn) => {
            const isInterviewer = turn.speaker === "Interviewer";
            const speakerLabel = isInterviewer ? "Interviewer" : "You";
            const isQuestion = isInterviewer && isInterviewerQuestion(turn.text);

            return (
              <div
                key={turn.id}
                style={{
                  backgroundColor: isInterviewer
                    ? isQuestion
                      ? `rgba(18, 30, 44, ${Math.min(1, bgOpacity + 0.1)})`
                      : `rgba(26, 26, 26, ${Math.min(1, bgOpacity + 0.08)})`
                    : `rgba(20, 20, 20, ${Math.min(1, bgOpacity + 0.04)})`,
                }}
                className={`group relative flex flex-col p-3 border transition-colors ${
                  isQuestion
                    ? "border-[#38bdf8]/60 shadow-[0_0_12px_rgba(56,189,248,0.15)] text-[#ffffff]"
                    : isInterviewer
                    ? "border-[#2c2c2c] text-[#f0f0f0]"
                    : "border-[#242424] text-[#f0f0f0]"
                }`}
              >
                {/* Speaker Header */}
                <div className="flex items-center justify-between mb-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    {isInterviewer ? (
                      <Headphones className="w-3.5 h-3.5 text-[#38bdf8]" />
                    ) : (
                      <User className="w-3.5 h-3.5 text-[#4ade80]" />
                    )}
                    <span
                      className={`font-bold ${
                        isInterviewer ? "text-[#38bdf8]" : "text-[#4ade80]"
                      }`}
                    >
                      {speakerLabel}
                    </span>

                    {/* Question Badge */}
                    {isQuestion && (
                      <span className="px-1.5 py-0.5 bg-[#163650] border border-[#38bdf8]/60 text-[#38bdf8] text-[10px] font-bold tracking-wider flex items-center gap-1 uppercase">
                        <HelpCircle className="w-3 h-3" />
                        <span>Question Detected</span>
                      </span>
                    )}

                    <span className="text-[#888888] font-mono text-[11px]">{turn.timestamp}</span>
                  </div>

                  {/* Actions on hover */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5">
                    {isInterviewer && (
                      <button
                        type="button"
                        onClick={() => onAskAiAboutTurn(turn.text)}
                        className="flex items-center gap-1 px-2 py-0.5 bg-[#282828] hover:bg-[#383838] text-[#38bdf8] text-xs font-semibold transition-colors"
                        title="Generate suggested answer for this question"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Answer This</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => copyToClipboard(turn.id, turn.text)}
                      className="p-1 bg-[#282828] hover:bg-[#383838] text-[#cccccc] hover:text-white transition-colors"
                      title="Copy text"
                    >
                      {copiedId === turn.id ? (
                        <Check className="w-3 h-3 text-[#4ade80]" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Speech Text */}
                <p className="leading-relaxed text-sm sm:text-base text-white whitespace-pre-wrap font-normal select-text">
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

