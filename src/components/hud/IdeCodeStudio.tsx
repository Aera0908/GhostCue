import React, { useState } from "react";
import { Copy, Check, Terminal, FileCode, Zap, Columns2, Rows2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useTranslation } from "../../i18n";

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
  const { t } = useTranslation();
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
      <div className="prose prose-invert max-w-none text-slate-100 font-sans leading-relaxed text-sm">
        <ReactMarkdown>{content}</ReactMarkdown>
        {isStreaming && (
          <span className="inline-block w-2 h-4 ml-1 bg-sky-400 rounded-sm animate-pulse align-middle" />
        )}
      </div>
    );
  }

  const lines = activeCodeBlock ? activeCodeBlock.code.split("\n") : [];

  return (
    <div className="flex flex-col gap-2.5 w-full font-sans">
      {/* View Switcher Strip */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-lg text-xs select-none">
        <div className="flex items-center gap-2 text-slate-200">
          <span className="font-semibold text-slate-100">{t.codeStudio.tabCode}</span>
          {parsed.codeBlocks.length > 1 && (
            <div className="flex items-center gap-1 ml-2">
              {parsed.codeBlocks.map((b, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedBlockIdx(i)}
                  className={`px-2 py-0.5 text-xs font-mono rounded transition-colors ${
                    selectedBlockIdx === i
                      ? "bg-slate-700 text-slate-100 font-bold"
                      : "bg-slate-900 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  #{i + 1} ({b.language})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Switcher Buttons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewMode("split")}
            className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors ${
              viewMode === "split"
                ? "bg-sky-600 text-white font-semibold"
                : "text-slate-400 hover:text-slate-200"
            }`}
            title="Split View"
          >
            <Columns2 className="w-3 h-3" />
            <span>Split</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("stacked")}
            className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors ${
              viewMode === "stacked"
                ? "bg-sky-600 text-white font-semibold"
                : "text-slate-400 hover:text-slate-200"
            }`}
            title="Stacked View"
          >
            <Rows2 className="w-3 h-3" />
            <span>Stacked</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("code-only")}
            className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors ${
              viewMode === "code-only"
                ? "bg-sky-600 text-white font-semibold"
                : "text-slate-400 hover:text-slate-200"
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
            ? "grid grid-cols-1 lg:grid-cols-12 gap-3 items-start"
            : "flex flex-col gap-3"
        }`}
      >
        {/* Left Column: Talking points & explanation */}
        {viewMode !== "code-only" && (
          <div
            className={`${
              viewMode === "split" ? "lg:col-span-5" : "w-full"
            } flex flex-col gap-2 p-3.5 bg-slate-950/70 border border-slate-800 rounded-lg text-slate-100 leading-relaxed overflow-y-auto max-h-[400px] scrollbar-thin`}
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 pb-1.5 border-b border-slate-800">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>{t.codeStudio.tabExplanation}</span>
            </div>

            <div className="prose prose-invert max-w-none text-slate-100 text-xs sm:text-sm leading-relaxed font-sans select-text">
              <ReactMarkdown>{parsed.explanation || "Implementation details provided in code viewer."}</ReactMarkdown>
            </div>
          </div>
        )}

        {/* Right Column: Code viewer */}
        <div
          className={`${
            viewMode === "split" ? "lg:col-span-7" : "w-full"
          } flex flex-col bg-slate-950 border border-slate-800 rounded-lg overflow-hidden`}
        >
          {/* Code Header */}
          <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-900 border-b border-slate-800 text-xs select-none">
            <div className="flex items-center gap-2">
              <FileCode className="w-3.5 h-3.5 text-sky-400" />
              <span className="font-mono uppercase text-xs font-semibold text-slate-100">
                {activeCodeBlock ? activeCodeBlock.language : "Code"}
              </span>
            </div>

            {activeCodeBlock && (
              <button
                type="button"
                onClick={() => handleCopyCode(activeCodeBlock.code, selectedBlockIdx)}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs rounded font-medium transition-colors"
                title={t.codeStudio.copySnippet}
              >
                {copiedCodeIdx === selectedBlockIdx ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-semibold">{t.common.copied}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>{t.common.copy}</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Code Table */}
          <div className="p-3.5 overflow-x-auto max-h-[380px] bg-slate-950 font-mono text-xs leading-relaxed scrollbar-thin">
            {activeCodeBlock ? (
              <table className="w-full border-collapse">
                <tbody>
                  {lines.map((line, lineIdx) => (
                    <tr key={lineIdx} className="hover:bg-slate-900/60 transition-colors group">
                      <td className="pr-4 text-right text-xs select-none text-slate-500 group-hover:text-slate-400 font-mono w-7 align-top">
                        {lineIdx + 1}
                      </td>
                      <td className="text-slate-100 font-mono whitespace-pre select-text">
                        {line || " "}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-slate-500 italic text-center py-6 text-sm">
                {t.codeStudio.noSnippets}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
