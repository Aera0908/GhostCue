import React, { useState } from "react";
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
    <div className="my-2.5 overflow-x-auto rounded-md border border-g-line">
      <table className="w-full border-collapse text-xs font-sans" {...props} />
    </div>
  ),
  th: ({ ...props }: any) => (
    <th className="border-b border-g-line bg-g-raised px-3 py-1.5 text-left font-medium text-g-text" {...props} />
  ),
  td: ({ ...props }: any) => (
    <td className="border-b border-g-line px-3 py-1.5 text-g-text" {...props} />
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
      <code className="rounded border border-g-line bg-g-raised px-1 py-0.5 font-mono text-[0.9em] font-normal text-g-text before:content-none after:content-none" {...props}>
        {children}
      </code>
    );
  },
};

export const IdeCodeStudio: React.FC<IdeCodeStudioProps> = ({ content, isStreaming, fontSize = 14 }) => {
  const { t } = useTranslation();
  const [copiedCodeIdx, setCopiedCodeIdx] = useState<number | null>(null);
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

    // A short countdown gives time to click into the editor that should receive the code.
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

  const prose = "prose prose-invert max-w-none select-text font-sans leading-relaxed text-g-text";
  const markdown = (text: string) => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
      components={customMarkdownComponents}
    >
      {text}
    </ReactMarkdown>
  );
  // While an answer is being written, a steady bar marks where the next words will appear.
  const caret = isStreaming ? <span aria-hidden="true" className="ml-0.5 inline-block h-4 w-1.5 bg-g-accent align-middle" /> : null;

  if (!parsed.hasCode) {
    return (
      <div className={prose} style={{ fontSize: `${fontSize}px` }}>
        {markdown(normalizeLatexMarkdown(content))}
        {caret}
      </div>
    );
  }

  const lines = activeCodeBlock ? activeCodeBlock.code.split("\n") : [];
  const explanation = normalizeLatexMarkdown(parsed.explanation);
  const quiet =
    "rounded px-1.5 py-0.5 text-xs text-g-muted hover:bg-g-hover hover:text-g-text active:bg-g-base disabled:opacity-40 " +
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-g-accent";

  return (
    <div className="flex w-full flex-col gap-3 font-sans">
      {explanation && (
        <div className={prose} style={{ fontSize: `${fontSize}px` }}>
          {markdown(explanation)}
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-g-line">
        <div className="flex h-8 select-none items-center gap-1 border-b border-g-line bg-g-raised px-2 text-xs">
          {parsed.codeBlocks.length > 1 ? (
            parsed.codeBlocks.map((block, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={selectedBlockIdx === i}
                onClick={() => setSelectedBlockIdx(i)}
                className={`${quiet} font-mono ${selectedBlockIdx === i ? "bg-g-base text-g-text" : ""}`}
              >
                {i + 1}. {block.language}
              </button>
            ))
          ) : (
            <span className="px-1.5 font-mono text-g-muted">{activeCodeBlock ? activeCodeBlock.language : t.codeStudio.tabCode}</span>
          )}

          {activeCodeBlock && (
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                className={quiet}
                onClick={() => handleStartStealthType(activeCodeBlock.code)}
                disabled={isStealthTyping || stealthCountdown !== null}
                title="Types this code into the window you click next, one key at a time (Ctrl+Shift+T)"
              >
                {isStealthTyping
                  ? "Typing"
                  : stealthCountdown !== null
                    ? `Click your editor, ${stealthCountdown}`
                    : "Type into editor"}
              </button>
              <button type="button" className={quiet} onClick={() => handleCopyCode(activeCodeBlock.code, selectedBlockIdx)} title={t.codeStudio.copySnippet}>
                {copiedCodeIdx === selectedBlockIdx ? t.common.copied : t.common.copy}
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto bg-g-base p-3 font-mono leading-relaxed" style={{ fontSize: `${Math.max(12, fontSize - 1)}px` }}>
          {activeCodeBlock ? (
            <table className="w-full border-collapse">
              <tbody>
                {lines.map((line, lineIdx) => (
                  <tr key={lineIdx}>
                    <td className="w-7 select-none pr-4 text-right align-top tabular-nums text-g-muted/60">{lineIdx + 1}</td>
                    <td className="select-text whitespace-pre text-g-text">{line || " "}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="py-4 text-[13px] text-g-muted">{t.codeStudio.noSnippets}</p>
          )}
        </div>
      </div>
      {caret}
    </div>
  );
};
