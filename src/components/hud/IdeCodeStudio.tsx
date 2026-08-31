import React, { useState } from "react";
import { Copy, Check, Terminal, FileCode, Zap, Columns2, Rows2 } from "lucide-react";
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

  if (!parsed.hasCode) {
    return (
      <div className="prose prose-invert max-w-none text-[#e0e0e0] font-sans text-sm sm:text-base leading-relaxed">
        <ReactMarkdown>{content}</ReactMarkdown>
        {isStreaming && (
          <span className="inline-block w-2 h-4 ml-1 bg-[#ffffff] animate-pulse align-middle" />
        )}
      </div>
    );
  }

  const lines = activeCodeBlock ? activeCodeBlock.code.split("\n") : [];

  return (
    <div className="flex flex-col gap-2 w-full font-sans">
      {/* View Switcher Strip */}
      <div className="flex items-center justify-between px-2.5 py-1 bg-[#161616] text-xs select-none">
        <div className="flex items-center gap-2 text-[#cccccc]">
          <span className="font-semibold text-white">Solution & Code</span>
          {parsed.codeBlocks.length > 1 && (
            <div className="flex items-center gap-1 ml-2">
              {parsed.codeBlocks.map((b, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedBlockIdx(i)}
                  className={`px-2 py-0.5 text-xs font-mono transition-colors ${
                    selectedBlockIdx === i
                      ? "bg-[#282828] text-white font-bold"
                      : "bg-[#1c1c1c] text-[#777777] hover:text-[#cccccc]"
                  }`}
                >
                  Snippet #{i + 1} ({b.language})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* View Switcher Buttons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewMode("split")}
            className={`flex items-center gap-1 px-2 py-0.5 text-xs transition-colors ${
              viewMode === "split"
                ? "bg-[#282828] text-white font-semibold"
                : "bg-[#1c1c1c] text-[#777777] hover:text-[#cccccc]"
            }`}
            title="Split: Explanation on Left, Code on Right"
          >
            <Columns2 className="w-3 h-3" />
            <span>Split</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("stacked")}
            className={`flex items-center gap-1 px-2 py-0.5 text-xs transition-colors ${
              viewMode === "stacked"
                ? "bg-[#282828] text-white font-semibold"
                : "bg-[#1c1c1c] text-[#777777] hover:text-[#cccccc]"
            }`}
            title="Stacked View"
          >
            <Rows2 className="w-3 h-3" />
            <span>Stacked</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("code-only")}
            className={`flex items-center gap-1 px-2 py-0.5 text-xs transition-colors ${
              viewMode === "code-only"
                ? "bg-[#282828] text-white font-semibold"
                : "bg-[#1c1c1c] text-[#777777] hover:text-[#cccccc]"
            }`}
            title="Code Only View"
          >
            <Terminal className="w-3 h-3" />
            <span>Code Only</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div
        className={`w-full ${
          viewMode === "split"
            ? "grid grid-cols-1 lg:grid-cols-12 gap-2 items-start"
            : "flex flex-col gap-2"
        }`}
      >
        {/* Left Column: Verbal Strategy & Complexity */}
        {viewMode !== "code-only" && (
          <div
            className={`${
              viewMode === "split" ? "lg:col-span-5" : "w-full"
            } flex flex-col gap-2 p-3 bg-[#141414] text-[#e0e0e0] leading-relaxed overflow-y-auto max-h-[380px] scrollbar-thin scrollbar-thumb-[#2a2a2a]`}
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#888888] pb-1 border-b border-[#202020]">
              <Zap className="w-3.5 h-3.5 text-[#facc15]" />
              <span>Explanation & Talking Points</span>
            </div>

            <div className="prose prose-invert max-w-none text-[#e0e0e0] text-sm sm:text-base leading-relaxed font-sans select-text">
              <ReactMarkdown>{parsed.explanation || "Implementation provided in code editor on the right."}</ReactMarkdown>
            </div>
          </div>
        )}

        {/* Right Column: Code Studio */}
        <div
          className={`${
            viewMode === "split" ? "lg:col-span-7" : "w-full"
          } flex flex-col bg-[#080808]`}
        >
          {/* Code Header Bar */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#121212] text-xs border-b border-[#1c1c1c] select-none">
            <div className="flex items-center gap-2">
              <FileCode className="w-3.5 h-3.5 text-[#38bdf8]" />
              <span className="font-mono uppercase text-xs font-semibold text-white">
                {activeCodeBlock ? activeCodeBlock.language : "Code"}
              </span>
            </div>

            {/* Copy Button */}
            {activeCodeBlock && (
              <button
                type="button"
                onClick={() => handleCopyCode(activeCodeBlock.code, selectedBlockIdx)}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1e1e1e] hover:bg-[#2a2a2a] text-[#cccccc] hover:text-white text-xs transition-colors"
                title="Copy code to clipboard"
              >
                {copiedCodeIdx === selectedBlockIdx ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#4ade80]" />
                    <span className="text-[#4ade80] font-semibold">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-[#888888]" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Code Body with Line Numbers */}
          <div className="relative p-3 overflow-x-auto max-h-[380px] bg-[#080808] scrollbar-thin scrollbar-thumb-[#2a2a2a] font-mono text-xs sm:text-sm leading-relaxed">
            {activeCodeBlock ? (
              <table className="w-full border-collapse">
                <tbody>
                  {lines.map((line, lineIdx) => (
                    <tr key={lineIdx} className="hover:bg-[#151515] transition-colors group">
                      <td className="pr-4 text-right text-xs select-none text-[#555555] group-hover:text-[#888888] font-mono w-7 align-top">
                        {lineIdx + 1}
                      </td>
                      <td className="text-[#f5f5f5] font-mono whitespace-pre select-text">
                        {line || " "}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-[#555555] italic text-center py-6 text-sm">
                No code generated.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
