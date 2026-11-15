import React, { useState } from "react";
import { useTranslation } from "../../i18n";
import { Button } from "../../ui/Button";

interface ActionControlsProps {
  isStreaming: boolean;
  onTriggerAction: (action: string, customQuery?: string) => void;
  onCancel: () => void;
}

/**
 * One row: a place to type, and the things that can be asked for. An action pressed with
 * text in the box applies to that text; with the box empty it applies to the conversation.
 */
export const ActionControls: React.FC<ActionControlsProps> = ({ isStreaming, onTriggerAction, onCancel }) => {
  const { t } = useTranslation();
  const [text, setText] = useState("");

  const actions: Array<[id: string, label: string, hint: string]> = [
    ["hint", t.actions.answer, `${t.actions.answerDesc} (Ctrl+Shift+Space)`],
    ["code", t.actions.code, `${t.actions.codeDesc} (Ctrl+Shift+K)`],
    ["clarify", t.actions.clarify, `${t.actions.clarifyDesc} (Ctrl+Shift+L)`],
    ["elaborate", t.actions.systemDesign, `${t.actions.systemDesignDesc} (Ctrl+Shift+E)`],
    ["summary", t.actions.summary, t.actions.summaryDesc],
    ["vision", t.actions.screenVision, `${t.actions.screenVisionDesc} (Ctrl+Shift+S)`],
  ];

  const run = (action: string) => {
    if (isStreaming) return;
    const typed = text.trim();
    onTriggerAction(action, typed || undefined);
    setText("");
  };

  return (
    <form
      aria-label="Ask for an answer"
      className="flex shrink-0 items-center gap-2 border-t border-g-line px-2.5 py-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim()) run("ask");
      }}
    >
      <input
        type="text"
        aria-label="Ask a question"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Ask a question, or press an action"
        className={
          "h-8 min-w-0 flex-1 select-text rounded-md border border-g-line bg-g-base px-2.5 text-[13px] text-g-text " +
          "placeholder:text-g-muted/70 hover:border-g-lineStrong focus:border-g-accent focus:outline-none focus-visible:outline-none"
        }
      />
      {isStreaming ? (
        <Button size="sm" variant="danger" onClick={onCancel} title={`${t.actions.stopAi} (Esc)`}>
          Stop
        </Button>
      ) : (
        actions.map(([id, label, hint], index) => (
          <Button key={id} size="sm" variant={index === 0 ? "primary" : "ghost"} title={hint} onClick={() => run(id)} className="px-2.5">
            {label}
          </Button>
        ))
      )}
    </form>
  );
};
