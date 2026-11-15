import React, { useEffect, useRef, useState } from "react";
import type { AppConfig } from "../../types/config";
import { Button } from "../../ui/Button";
import { StepTransition } from "../../ui/StepTransition";
import { WindowBar } from "../../ui/WindowBar";
import { ProviderSetup } from "../providers/ProviderSetup";
import { ListeningSetup } from "../listening/ListeningSetup";
import { SoundCheck } from "./SoundCheck";

export const SETUP_STORAGE_KEY = "ghostcue_setup";

type Step = 1 | 2 | 3;
interface Progress {
  step: Step;
  done: boolean;
}

function readProgress(): Progress {
  try {
    const raw = JSON.parse(localStorage.getItem(SETUP_STORAGE_KEY) ?? "null");
    if (raw && typeof raw === "object" && [1, 2, 3].includes(raw.step)) {
      return { step: raw.step as Step, done: raw.done === true };
    }
  } catch {
    // Unreadable progress is the same as none.
  }
  return { step: 1, done: false };
}

function writeProgress(progress: Progress) {
  try {
    localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Without storage, setup simply starts from the first step next time.
  }
}

/** Setup is for a first run. Anyone who already has interviews saved goes straight in. */
export function shouldShowSetup(sessionCount: number): boolean {
  if (sessionCount > 0) return false;
  return !readProgress().done;
}

const STEPS: Record<Step, { title: string; lead: string }> = {
  1: {
    title: "Where answers come from",
    lead: "Pick one service to write the answers. You can change it later in Settings.",
  },
  2: {
    title: "How GhostCue listens",
    lead: "Speech is turned into text before it can be answered. Choose where that happens.",
  },
  3: {
    title: "Sound check",
    lead: "An interview has two voices. Check that both reach GhostCue.",
  },
};

interface SetupFlowProps {
  config: AppConfig;
  onChange: (patch: Partial<AppConfig>) => Promise<void>;
  onDone: () => void;
}

export const SetupFlow: React.FC<SetupFlowProps> = ({ config, onChange, onDone }) => {
  const [step, setStep] = useState<Step>(() => readProgress().step);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [answersReady, setAnswersReady] = useState(false);
  const [listeningReady, setListeningReady] = useState(false);
  const movedAt = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  useEffect(() => {
    // After a step change, focus moves to the new heading so keyboard and screen reader users follow.
    if (first.current) {
      first.current = false;
      return;
    }
    const id = window.setTimeout(() => heading.current?.focus(), 240);
    return () => window.clearTimeout(id);
  }, [step]);

  const go = (next: Step) => {
    // A second press that lands while the step is still changing is ignored.
    const now = Date.now();
    if (now - movedAt.current < 350) return;
    movedAt.current = now;
    setDirection(next > step ? 1 : -1);
    setStep(next);
    writeProgress({ step: next, done: false });
  };

  const finish = () => {
    writeProgress({ step, done: true });
    onDone();
  };

  const canContinue = step === 1 ? answersReady : step === 2 ? listeningReady : true;
  const blocked =
    step === 1
      ? "Save a key and choose a model to continue."
      : "Download a model or save a key to continue.";

  return (
    <main className="flex h-screen w-screen flex-col bg-g-base text-g-text">
      <WindowBar title="Set up GhostCue" />
      <header className="shrink-0 border-b border-g-line px-8 pb-4 pt-5">
        <div className="mx-auto max-w-2xl">
        <p className="text-xs text-g-muted">Step {step} of 3</p>
        <h1 ref={heading} tabIndex={-1} className="mt-1 text-xl font-semibold tracking-[-0.01em] outline-none">
          {STEPS[step].title}
        </h1>
        <p className="mt-1 max-w-prose text-sm leading-6 text-g-muted">{STEPS[step].lead}</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-2xl">
          <StepTransition stepKey={String(step)} direction={direction}>
            {step === 1 && <ProviderSetup config={config} onChange={onChange} onReadyChange={setAnswersReady} />}
            {step === 2 && <ListeningSetup config={config} onChange={onChange} onReadyChange={setListeningReady} />}
            {step === 3 && <SoundCheck config={config} onChange={onChange} />}
          </StepTransition>
        </div>
      </div>

      <footer className="shrink-0 border-t border-g-line px-8 py-4">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
        <Button variant="ghost" onClick={finish}>
          Set up later
        </Button>
        <p className="ml-auto text-[13px] text-g-muted" aria-live="polite">
          {!canContinue ? blocked : ""}
        </p>
        {step > 1 && (
          <Button variant="secondary" onClick={() => go((step - 1) as Step)}>
            Back
          </Button>
        )}
        {step < 3 ? (
          <Button variant="primary" disabled={!canContinue} onClick={() => go((step + 1) as Step)}>
            Continue
          </Button>
        ) : (
          <Button variant="primary" onClick={finish}>
            Finish
          </Button>
        )}
        </div>
      </footer>
    </main>
  );
};
