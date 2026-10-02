import React, { useState } from "react";
import { Copy, Check, Terminal, FileCode, Zap, Columns2, Rows2, Keyboard, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { useTranslation } from "../../i18n";
import { TauriApi } from "../../services/tauriApi";

interface IdeCodeStudioProps {
  content: string;
  isStreaming: boolean;
  activeAction: string;
  fontSize?: number;
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
  if (!rawText) {
    return { hasCode: false, explanation: "", codeBlocks: [] };
  }

  // Normalize CRLF to LF
  const normalized = rawText.replace(/\r\n/g, "\n");
  const codeBlockRegex = /```([a-zA-Z0-9_+#.-]*)\n([\s\S]*?)```/g;
  const codeBlocks: Array<{ language: string; code: string }> = [];
  
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(normalized)) !== null) {
    const lang = match[1] ? match[1].trim().toLowerCase() : "code";
    const code = match[2] ? match[2].trimEnd() : "";
    if (code) {
      codeBlocks.push({
        language: lang || "code",
        code,
      });
    }
  }

  let explanation = normalized;
  if (codeBlocks.length > 0) {
    explanation = normalized.replace(codeBlockRegex, "").trim();
  } else {
    // If streaming or unclosed code block at end:
    const unclosedRegex = /```([a-zA-Z0-9_+#.-]*)\n([\s\S]*)$/;
    const unclosedMatch = unclosedRegex.exec(normalized);
    if (unclosedMatch) {
      codeBlocks.push({
        language: unclosedMatch[1]?.trim().toLowerCase() || "code",
        code: unclosedMatch[2]?.trimEnd() || "",
      });
      explanation = normalized.replace(unclosedRegex, "").trim();
    }
  }

  return {
    hasCode: codeBlocks.length > 0,
    explanation,
    codeBlocks,
  };
};

/**
 * Normalizes common LaTeX delimiters (\[...\], \(...\)) and inner dollar spaces
 * so remark-math and rehype-katex render math formulas and special symbols cleanly.
 */
export const normalizeLatexMarkdown = (text: string): string => {
  if (!text) return "";

  // 1. Convert display math delimiters \[ ... \] into $$ ... $$
  let res = text.replace(/\\\[([\s\S]*?)\\\]/g, (_m, math) => `\n$$\n${math.trim()}\n$$\n`);

  // 2. Convert inline math delimiters \( ... \) into $ ... $
  res = res.replace(/\\\(([\s\S]*?)\\\)/g, (_m, math) => `$${math.trim()}$`);

  // 3. Normalize single dollar expressions with inner spaces: "$ expr $" -> "$expr$"
  res = res.replace(/\$([^\$\n]+?)\$/g, (_m, expr) => `$${expr.trim()}$`);

  return res;
};

const customMarkdownComponents = {
  table: ({ ...props }: any) => (
    <div className="overflow-x-auto my-2.5 rounded-lg border border-slate-800 bg-slate-950/60">
      <table className="w-full border-collapse text-xs font-sans" {...props} />
    </div>
  ),
  th: ({ ...props }: any) => (
    <th className="bg-slate-900/90 border-b border-slate-800 px-3 py-1.5 text-left font-semibold text-sky-400" {...props} />
  ),
  td: ({ ...props }: any) => (
    <td className="border-b border-slate-800/60 px-3 py-1.5 text-slate-200" {...props} />
  ),
  code: ({ className, children, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || "");
    if (match) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-sky-300 font-mono text-[11px]" {...props}>
        {children}
      </code>
    );
  },
};

export const IdeCodeStudio: React.FC<IdeCodeStudioProps> = ({
  content,
  isStreaming,
  fontSize = 14,
}) => {
  const { t } = useTranslation();
  const [copiedCodeIdx, setCopiedCodeIdx] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"split" | "stacked" | "code-only">("split");
  const [selectedBlockIdx, setSelectedBlockIdx] = useState<number>(0);
  const [isStealthTyping, setIsStealthTyping] = useState<boolean>(false);
  const [stealthCountdown, setStealthCountdown] = useState<number | null>(null);

  const parsed = parseCodeAndExplanation(content);
  const activeCodeBlock = parsed.codeBlocks[selectedBlockIdx] || parsed.codeBlocks[0];

  const handleCopyCode = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeIdx(idx);
    setTimeout(() => setCopiedCodeIdx(null), 2000);
  };

  const handleStartStealthType = async (code: string) => {
    if (isStealthTyping || !code.trim()) return;

    // Countdown before simulated typing starts
    setStealthCountdown(2);
    const interval = setInterval(() => {
      setStealthCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    setTimeout(async () => {
      clearInterval(interval);
      setStealthCountdown(null);
      setIsStealthTyping(true);
      try {
        await TauriApi.typeTextStealth(code);
      } catch (err) {
        console.error("Stealth typing error:", err);
      } finally {
        setIsStealthTyping(false);
      }
    }, 2000);
  };

  if (!parsed.hasCode) {
    const formattedContent = normalizeLatexMarkdown(content);
    return (
      <div
        className="prose prose-invert max-w-none text-slate-100 font-sans leading-relaxed"
        style={{ fontSize: `${fontSize}px` }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
          components={customMarkdownComponents}
        >
          {formattedContent}
        </ReactMarkdown>
        {isStreaming && (
          <span className="inline-block w-2 h-4 ml-1 bg-sky-400 rounded-sm animate-pulse align-middle" />
        )}
      </div>
    );
  }

  const lines = activeCodeBlock ? activeCodeBlock.code.split("\n") : [];

  return (
    <div className="flex flex-col gap-2.5 w-full h-full flex-1 min-h-0 font-sans">
      {/* View Switcher Strip */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-lg text-xs select-none shrink-0">
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
        className={`w-full flex-1 min-h-0 ${
          viewMode === "split"
            ? "grid grid-cols-1 min-[620px]:grid-cols-12 gap-3 h-full"
            : "flex flex-col gap-3 h-full"
        }`}
      >
        {/* Left Column: Talking points & explanation */}
        {viewMode !== "code-only" && (
          <div
            className={`${
              viewMode === "split" ? "min-[620px]:col-span-5 h-full" : "w-full"
            } flex flex-col gap-2 p-3.5 bg-slate-950/70 border border-slate-800 rounded-lg text-slate-100 leading-relaxed overflow-y-auto scrollbar-thin min-h-0`}
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 pb-1.5 border-b border-slate-800 shrink-0">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>{t.codeStudio.tabExplanation}</span>
            </div>

            <div
              className="prose prose-invert max-w-none text-slate-100 leading-relaxed font-sans select-text flex-1"
              style={{ fontSize: `${fontSize}px` }}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
                components={customMarkdownComponents}
              >
                {normalizeLatexMarkdown(parsed.explanation) || "Implementation details provided in code viewer."}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {/* Right Column: Code viewer */}
        <div
          className={`${
            viewMode === "split" ? "min-[620px]:col-span-7 h-full" : "w-full"
          } flex flex-col bg-slate-950 border border-slate-800 rounded-lg overflow-hidden min-h-0 flex-1`}
        >
          {/* Code Header */}
          <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-900 border-b border-slate-800 text-xs select-none shrink-0">
            <div className="flex items-center gap-2">
              <FileCode className="w-3.5 h-3.5 text-sky-400" />
              <span className="font-mono uppercase text-xs font-semibold text-slate-100">
                {activeCodeBlock ? activeCodeBlock.language : "Code"}
              </span>
            </div>

            {activeCodeBlock && (
              <div className="flex items-center gap-1.5">
                {/* Stealth Typer Button (Bypasses editor paste detection on assessment platforms) */}
                <button
                  type="button"
                  onClick={() => handleStartStealthType(activeCodeBlock.code)}
                  disabled={isStealthTyping || stealthCountdown !== null}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded font-medium transition-all ${
                    isStealthTyping
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse"
                      : stealthCountdown !== null
                      ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                      : "bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/40"
                  }`}
                  title="Bypass Editor Paste Detection: Automatically types this code keystroke-by-keystroke into your active editor (Ctrl+Shift+T)"
                >
                  {isStealthTyping ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                      <span>Typing code...</span>
                    </>
                  ) : stealthCountdown !== null ? (
                    <>
                      <Keyboard className="w-3.5 h-3.5 text-sky-400 animate-bounce" />
                      <span>Focus Editor ({stealthCountdown}s)...</span>
                    </>
                  ) : (
                    <>
                      <Keyboard className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Stealth Type</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleCopyCode(activeCodeBlock.code, selectedBlockIdx)}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs rounded font-medium transition-colors border border-slate-700"
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
              </div>
            )}
          </div>

          {/* Code Table */}
          <div
            className="p-3.5 overflow-auto flex-1 min-h-0 bg-slate-950 font-mono leading-relaxed scrollbar-thin"
            style={{ fontSize: `${Math.max(10, fontSize - 1)}px` }}
          >
            {activeCodeBlock ? (
              <table className="w-full border-collapse">
                <tbody>
                  {lines.map((line, lineIdx) => (
                    <tr key={lineIdx} className="hover:bg-slate-900/60 transition-colors group">
                      <td
                        className="pr-4 text-right select-none text-slate-500 group-hover:text-slate-400 font-mono w-7 align-top"
                        style={{ fontSize: `${Math.max(10, fontSize - 2)}px` }}
                      >
                        {lineIdx + 1}
                      </td>
                      <td
                        className="text-slate-100 font-mono whitespace-pre select-text"
                        style={{ fontSize: `${Math.max(10, fontSize - 1)}px` }}
                      >
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
