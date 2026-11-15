import React, { useEffect, useRef, useState } from "react";
import { KeyId, TauriApi } from "../../services/tauriApi";
import type { AppConfig } from "../../types/config";
import type { InterviewSession } from "../../types/session";
import { Button } from "../../ui/Button";
import { Notice } from "../../ui/Notice";
import { WindowBar } from "../../ui/WindowBar";
import { keyIsReady, providerBySlug } from "../providers/providers";
import { LISTENING_SERVICES, listeningReady, WhisperModel } from "../listening/ListeningSetup";

export type SettingsSection = "answers" | "listening" | "sound" | "interview" | "window" | "language";

interface HomeProps {
  config: AppConfig;
  sessions: InterviewSession[];
  onNew: () => void;
  onOpen: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  onExport: (session: InterviewSession) => void;
  /** Opens Settings, at a section when something there needs attention. */
  onSettings: (section?: SettingsSection) => void;
  /** A one-time message from startup, such as keys having been moved. */
  notice?: string | null;
  onDismissNotice?: () => void;
  /** Change this to make Home look at keys and models again, for example after Settings closes. */
  refreshToken?: number;
}

interface Readiness {
  /** One sentence describing the working setup. */
  summary: string;
  /** What stops an interview from starting, and where to fix it. */
  problem: { message: string; section: SettingsSection } | null;
}

/** Whether an interview can be answered and heard with the saved settings. */
export function readiness(
  config: AppConfig,
  keys: Partial<Record<KeyId, boolean>>,
  models: WhisperModel[]
): Readiness {
  const provider = providerBySlug(config.llm_provider);
  const model = provider ? String(config[provider.modelField] ?? "").trim() : "";
  const service = LISTENING_SERVICES.find((s) => s.value === config.stt_provider);

  let problem: Readiness["problem"] = null;
  if (!provider) {
    problem = { message: "Choose where answers come from before starting an interview.", section: "answers" };
  } else if (!keyIsReady(provider, keys)) {
    problem = { message: `${provider.name} needs an API key before it can answer.`, section: "answers" };
  } else if (!model) {
    problem = { message: `${provider.name} has no model chosen yet.`, section: "answers" };
  } else if (!service) {
    problem = { message: "Choose how GhostCue listens before starting an interview.", section: "listening" };
  } else if (!listeningReady(config, keys, models)) {
    problem = {
      message: service.keyId
        ? `${service.title} needs an API key before it can transcribe.`
        : "Nothing can transcribe yet: no Whisper model is downloaded.",
      section: "listening",
    };
  }

  const listening = service ? (service.keyId ? `Listening through ${service.title}.` : "Listening on this computer.") : "";
  const summary = provider && model ? `Answers from ${provider.name} using ${model}. ${listening}` : listening;
  return { summary: summary.trim(), problem };
}

function when(iso: string): string {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function sortKey(session: InterviewSession): number {
  const time = new Date(session.lastActive || session.createdAt).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export const Home: React.FC<HomeProps> = ({
  config,
  sessions,
  onNew,
  onOpen,
  onDelete,
  onExport,
  onSettings,
  notice,
  onDismissNotice,
  refreshToken,
}) => {
  const [status, setStatus] = useState<Readiness | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    Promise.all([
      TauriApi.getKeyStatus().catch(() => ({})),
      TauriApi.getAvailableWhisperModels().catch(() => []),
    ]).then(([keys, models]) => {
      if (alive.current) setStatus(readiness(config, keys, models as WhisperModel[]));
    });
    return () => {
      alive.current = false;
    };
  }, [config, refreshToken]);

  const canStart = status !== null && status.problem === null;
  const ordered = [...sessions].sort((a, b) => sortKey(b) - sortKey(a));

  return (
    <main className="flex h-screen w-screen flex-col bg-g-base text-g-text">
      <WindowBar title="GhostCue">
        <Button variant="ghost" size="sm" onClick={() => onSettings()}>
          Settings
        </Button>
      </WindowBar>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-end justify-between gap-6">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-[-0.01em]">Interviews</h1>
              {status && !status.problem && <p className="mt-1 text-[13px] leading-5 text-g-muted">{status.summary}</p>}
            </div>
            {canStart && (
              <Button variant="primary" onClick={onNew}>
                New interview
              </Button>
            )}
          </div>

          {notice && (
            <div className="mt-4 flex items-start justify-between gap-4 rounded-md border border-g-line px-4 py-3">
              <Notice kind="info" className="select-text text-g-text">
                {notice}
              </Notice>
              <Button variant="ghost" size="sm" onClick={onDismissNotice}>
                Dismiss
              </Button>
            </div>
          )}

          {status?.problem && (
            <div className="mt-4 flex items-center justify-between gap-4 rounded-md border border-g-line px-4 py-3">
              <Notice kind="problem">{status.problem.message}</Notice>
              <Button variant="primary" size="sm" onClick={() => onSettings(status.problem!.section)}>
                Open settings
              </Button>
            </div>
          )}

          {ordered.length === 0 ? (
            <p className="mt-10 text-sm leading-6 text-g-muted">
              No interviews yet. A new interview asks about the role and about you, then opens the live view.
            </p>
          ) : (
            <ul className="mt-6 divide-y divide-g-line border-y border-g-line">
              {ordered.map((s) => {
                const title = s.title?.trim() || "Untitled interview";
                const about = [s.role?.trim(), s.company?.trim()].filter(Boolean).join(", ");
                const date = when(s.lastActive || s.createdAt);
                return (
                  <li key={s.id} className="flex min-h-14 items-center gap-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-sm font-medium">{title}</h2>
                      <p className="truncate text-[13px] text-g-muted">{[about, date].filter(Boolean).join(" · ")}</p>
                    </div>
                    {confirming === s.id ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-[13px] text-g-muted">Delete this interview and its transcript?</span>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            setConfirming(null);
                            onDelete(s.id);
                          }}
                        >
                          Delete for good
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                          Keep
                        </Button>
                      </div>
                    ) : (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button size="sm" variant="ghost" aria-label={`Export ${title}`} onClick={() => onExport(s)}>
                          Export
                        </Button>
                        <Button size="sm" variant="ghost" aria-label={`Delete ${title}`} onClick={() => setConfirming(s.id)}>
                          Delete
                        </Button>
                        <Button size="sm" aria-label={`Continue ${title}`} disabled={!canStart} onClick={() => onOpen(s.id)}>
                          Continue
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
};
