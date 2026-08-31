import React, { useState } from "react";
import { Copy, Check, Terminal, FileCode, Zap, Code2, Columns2, Rows2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface IdeCodeStudioProps {
  content: string;
  isStreaming: boolean;
  activeAction: string;
}

interface ParsedResponse {
  hasCode: boolean;
  explanation: string;
  codeBlocks: Array<{
    language: string;
    code: string;
  }>;
}

export const parseCodeAndExplanation = (rawText: string): ParsedResponse => {
  const codeBlockRegex = /```([a-zA-Z0-9_+#.-]*)\n([\s\S]*?)```/g;
  const codeBlocks: Array<{ language: string; code: string }> = [];
  
  let explanation = rawText;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(rawText)) !== null) {
    const lang = match[1] ? match[1].trim().toLowerCase() : "code";
    const code = match[2] ? match[2].trimEnd() : "";
    if (code) {
      codeBlocks.push({
        language: lang || "code",
        code,
      });
    }
  }

  // Remove code blocks from explanation to leave clean text
  if (codeBlocks.length > 0) {
    explanation = rawText.replace(codeBlockRegex, "").trim();
  }

  return {
    hasCode: codeBlocks.length > 0,
    explanation,
    codeBlocks,
  };
};

export const IdeCodeStudio: React.FC<IdeCodeStudioProps> = ({
  content,
  isStreaming,
  activeAction,
}) => {
  const [copiedCodeIdx, setCopiedCodeIdx] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"split" | "stacked" | "code-only">("split");
  const [selectedBlockIdx, setSelectedBlockIdx] = useState<number>(0);

  const parsed = parseCodeAndExplanation(content);
  const activeCodeBlock = parsed.codeBlocks[selectedBlockIdx] || parsed.codeBlocks[0];

  const handleCopyCode = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeIdx(idx);
    setTimeout(() => setCopiedCodeIdx(null), 2000);
  };

  // If no code is present and not explicitly code action, return standard layout
  if (!parsed.hasCode) {
    return (
      <div className="prose prose-invert prose-xs max-w-none text-slate-100 font-sans leading-relaxed">
        <ReactMarkdown>{content}</ReactMarkdown>
        {isStreaming && (
          <span className="inline-block w-1.5 h-3.5 ml-1 bg-sky-400 animate-pulse align-middle" />
        )}
      </div>
    );
  }

  const lines = activeCodeBlock ? activeCodeBlock.code.split("\n") : [];

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* View Mode Bar */}
      <div className="flex items-center justify-between px-2 py-1 bg-slate-950/80 rounded-md border border-white/5 text-[10px]">
        <div className="flex items-center gap-1.5 text-sky-400 font-medium">
          <Code2 className="w-3.5 h-3.5 text-sky-400" />
          <span>IDE Technical Mode ({activeAction})</span>
          {parsed.codeBlocks.length > 1 && (
            <div className="flex items-center gap-1 ml-2">
              {parsed.codeBlocks.map((b, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedBlockIdx(i)}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono border transition-all ${
                    selectedBlockIdx === i
                      ? "bg-sky-500/20 border-sky-500/50 text-sky-300"
                      : "bg-slate-900 border-slate-800 text-slate-400"
                  }`}
                >
                  Snippet #{i + 1} ({b.language})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Layout Toggle Buttons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewMode("split")}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-all ${
              viewMode === "split"
                ? "bg-sky-950/70 border border-sky-500/40 text-sky-300 shadow-[0_0_6px_rgba(56,189,248,0.2)]"
                : "bg-slate-900 text-slate-400 hover:text-slate-200"
            }`}
            title="Split View (Left: Explanation, Right: Code IDE)"
          >
            <Columns2 className="w-2.5 h-2.5" />
            <span>Split IDE</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("stacked")}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-all ${
              viewMode === "stacked"
                ? "bg-sky-950/70 border border-sky-500/40 text-sky-300"
                : "bg-slate-900 text-slate-400 hover:text-slate-200"
            }`}
            title="Stacked View"
          >
            <Rows2 className="w-2.5 h-2.5" />
            <span>Stacked</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("code-only")}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-all ${
              viewMode === "code-only"
                ? "bg-sky-950/70 border border-sky-500/40 text-sky-300"
                : "bg-slate-900 text-slate-400 hover:text-slate-200"
            }`}
            title="Code Only View"
          >
            <Terminal className="w-2.5 h-2.5" />
            <span>Code Only</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div
        className={`w-full ${
          viewMode === "split"
            ? "grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-start"
            : "flex flex-col gap-2.5"
        }`}
      >
        {/* Left Column: Explanation, Complexity & Verbal Points */}
        {viewMode !== "code-only" && (
          <div
            className={`${
              viewMode === "split" ? "lg:col-span-5" : "w-full"
            } flex flex-col gap-2 p-2.5 rounded-lg bg-slate-950/60 border border-white/5 text-xs text-slate-200 leading-relaxed overflow-y-auto max-h-[300px] scrollbar-thin scrollbar-thumb-slate-800`}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-300 uppercase tracking-wider border-b border-white/5 pb-1">
              <Zap className="w-3 h-3 text-sky-400" />
              <span>Verbal Explanation & Approach</span>
            </div>

            <div className="prose prose-invert prose-xs max-w-none text-slate-200 leading-relaxed font-sans">
              <ReactMarkdown>{parsed.explanation || "Detailed code solution presented on the right."}</ReactMarkdown>
            </div>
          </div>
        )}

        {/* Right Column: IDE Code Studio */}
        <div
          className={`${
            viewMode === "split"
              ? "lg:col-span-7"
              : "w-full"
          } flex flex-col rounded-lg overflow-hidden border border-sky-500/30 bg-[#0d1117] shadow-xl`}
        >
          {/* IDE Editor Header */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-white/10 text-[11px] select-none">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
              </div>

              <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-sky-300">
                <FileCode className="w-3 h-3 text-sky-400" />
                <span className="uppercase font-semibold tracking-wider">
                  {activeCodeBlock ? activeCodeBlock.language : "solution.code"}
                </span>
              </div>
            </div>

            {/* Copy Button */}
            {activeCodeBlock && (
              <button
                type="button"
                onClick={() => handleCopyCode(activeCodeBlock.code, selectedBlockIdx)}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-sky-950/60 hover:bg-sky-900/80 border border-sky-500/40 text-sky-200 text-[10px] font-medium transition-all"
                title="Copy code snippet to clipboard"
              >
                {copiedCodeIdx === selectedBlockIdx ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-sky-400" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* IDE Code Body with Line Numbers */}
          <div className="relative p-2.5 overflow-x-auto max-h-[300px] bg-[#0d1117] scrollbar-thin scrollbar-thumb-slate-700 font-mono text-[11px] leading-snug">
            {activeCodeBlock ? (
              <table className="w-full border-collapse">
                <tbody>
                  {lines.map((line, lineIdx) => (
                    <tr key={lineIdx} className="hover:bg-white/[0.04] transition-colors group">
                      {/* Line Number Gutter */}
                      <td className="pr-3 text-right text-[10px] select-none text-slate-600 group-hover:text-slate-400 font-mono w-6 align-top">
                        {lineIdx + 1}
                      </td>
                      {/* Code Line */}
                      <td className="text-emerald-300 font-mono whitespace-pre select-text">
                        {line || " "}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-slate-500 italic text-center py-4">
                No code block generated.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
