import React, { useEffect, useRef, useState } from "react";
import { Copy, Trash2, ArrowDown, Sparkles, User, Headphones } from "lucide-react";
import { TranscriptSegment } from "../../types/transcript";

interface TranscriptStreamProps {
  transcripts: TranscriptSegment[];
  onClear: () => void;
  onAskAiAboutTurn: (text: string) => void;
}

export const TranscriptStream: React.FC<TranscriptStreamProps> = ({
  transcripts,
  onClear,
  onAskAiAboutTurn,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Auto-scroll when new transcripts arrive
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
    <div className="flex flex-col h-full bg-slate-950/40 rounded-lg border border-white/5 overflow-hidden">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/40 border-b border-white/5 text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5 font-medium text-slate-300">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
          <span>Live Conversation Stream</span>
          <span className="text-[10px] text-slate-500 font-mono">({transcripts.length} turns)</span>
        </div>

        <div className="flex items-center gap-2">
          {!autoScroll && (
            <button
              type="button"
              onClick={() => {
                setAutoScroll(true);
                if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              }}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-950/80 border border-sky-600/40 text-sky-300 text-[10px] hover:bg-sky-900"
            >
              <ArrowDown className="w-2.5 h-2.5" />
              <span>Scroll Down</span>
            </button>
          )}

          {transcripts.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-rose-400 transition-colors"
              title="Clear transcript history"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Transcript Scroll Area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 p-2.5 space-y-2 overflow-y-auto font-sans text-xs scrollbar-thin scrollbar-thumb-slate-800"
      >
        {transcripts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 py-6 px-4">
            <Headphones className="w-8 h-8 text-slate-600 mb-2 opacity-50 stroke-[1.5]" />
            <p className="font-medium text-slate-400 text-xs">Waiting for conversation audio...</p>
            <p className="text-[11px] text-slate-600 mt-1 max-w-[280px]">
              Microphone and System Audio loopback will stream here in real time with speaker tagging.
            </p>
          </div>
        ) : (
          transcripts.map((turn) => {
            const isInterviewer = turn.speaker === "Interviewer";
            return (
              <div
                key={turn.id}
                className={`group relative flex flex-col p-2 rounded-lg border transition-all ${
                  isInterviewer
                    ? "bg-sky-950/20 border-sky-800/30 text-sky-100"
                    : "bg-emerald-950/20 border-emerald-800/30 text-emerald-100"
                }`}
              >
                {/* Speaker Tag & Timestamp */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    {isInterviewer ? (
                      <Headphones className="w-3 h-3 text-sky-400" />
                    ) : (
                      <User className="w-3 h-3 text-emerald-400" />
                    )}
                    <span
                      className={`font-semibold text-[11px] tracking-wide ${
                        isInterviewer ? "text-sky-400" : "text-emerald-400"
                      }`}
                    >
                      {turn.speaker}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">{turn.timestamp}</span>
                  </div>

                  {/* Actions on hover */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                    {isInterviewer && (
                      <button
                        type="button"
                        onClick={() => onAskAiAboutTurn(turn.text)}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-900/60 hover:bg-sky-800 text-[10px] text-sky-200"
                        title="Generate AI response for this question"
                      >
                        <Sparkles className="w-2.5 h-2.5 text-sky-300" />
                        <span>Cue</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => copyToClipboard(turn.id, turn.text)}
                      className="p-1 rounded bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-slate-200"
                      title="Copy text"
                    >
                      <Copy className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>

                {/* Speech Text */}
                <p className="leading-relaxed text-slate-200 whitespace-pre-wrap font-normal select-text">
                  {turn.text}
                </p>

                {copiedId === turn.id && (
                  <span className="absolute bottom-1 right-2 text-[9px] font-mono text-emerald-400 bg-emerald-950/90 px-1 py-0.5 rounded border border-emerald-500/40">
                    Copied!
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
