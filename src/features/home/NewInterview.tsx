import React, { useEffect, useRef, useState } from "react";
import { DEFAULT_CONFIG, TauriApi } from "../../services/tauriApi";
import type { AppConfig } from "../../types/config";
import type { InterviewSession } from "../../types/session";
import { extractTextFromFile } from "../../utils/fileParser";
import { Button } from "../../ui/Button";
import { Field, TextArea, TextInput } from "../../ui/Field";
import { Notice } from "../../ui/Notice";
import { StepTransition } from "../../ui/StepTransition";
import { WindowBar } from "../../ui/WindowBar";

export const NEW_INTERVIEW_DRAFT_KEY = "ghostcue_new_interview_draft";

type NewSession = Omit<InterviewSession, "id" | "createdAt" | "lastActive" | "transcripts" | "aiLogs">;

interface NewInterviewProps {
  config: AppConfig;
  onCreate: (session: NewSession) => void;
  onCancel: () => void;
}

interface Draft {
  step: 1 | 2;
  role: string;
  company: string;
  jobDescription: string;
  resume: string;
  folders: string[];
  context: string;
}

function messageOf(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return "Something went wrong. Try again.";
}

/** A setting counts as the user's own only when it differs from the sample text the app ships with. */
function own(value: string | undefined, sample: string | undefined): string {
  const text = (value ?? "").trim();
  return text && text !== (sample ?? "").trim() ? text : "";
}

function initialDraft(config: AppConfig): Draft {
  const fresh: Draft = {
    step: 1,
    role: own(config.target_role, DEFAULT_CONFIG.target_role),
    company: (config.company_name ?? "").trim(),
    jobDescription: own(config.job_description, DEFAULT_CONFIG.job_description),
    resume: own(config.candidate_resume, DEFAULT_CONFIG.candidate_resume),
    folders: [],
    context: "",
  };
  try {
    const raw = JSON.parse(localStorage.getItem(NEW_INTERVIEW_DRAFT_KEY) ?? "null");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fresh;
    const text = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
    return {
      step: raw.step === 2 ? 2 : 1,
      role: text(raw.role, ""),
      company: text(raw.company, ""),
      jobDescription: text(raw.jobDescription, ""),
      resume: text(raw.resume, ""),
      folders: Array.isArray(raw.folders) ? raw.folders.filter((f: unknown) => typeof f === "string") : [],
      context: text(raw.context, ""),
    };
  } catch {
    return fresh;
  }
}

export const NewInterview: React.FC<NewInterviewProps> = ({ config, onCreate, onCancel }) => {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(config));
  const [direction, setDirection] = useState<1 | -1>(1);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [folderNote, setFolderNote] = useState<{ kind: "info" | "problem"; text: string } | null>(null);
  const [fileNote, setFileNote] = useState<{ kind: "info" | "problem"; text: string } | null>(null);
  const [busy, setBusy] = useState<"folder" | "file" | null>(null);
  const alive = useRef(true);
  const created = useRef(false);
  const movedAt = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (created.current) return;
    try {
      localStorage.setItem(NEW_INTERVIEW_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // The draft is a convenience. Without storage the form still works.
    }
  }, [draft]);

  const set = (patch: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...patch }));

  const move = (step: 1 | 2) => {
    const now = Date.now();
    if (now - movedAt.current < 350) return;
    if (step === 2 && !draft.role.trim()) {
      setRoleError("Enter the role you are interviewing for.");
      return;
    }
    movedAt.current = now;
    setRoleError(null);
    setDirection(step === 2 ? 1 : -1);
    set({ step });
  };

  const scan = async (folders: string[]) => {
    if (folders.length === 0) {
      set({ context: "" });
      setFolderNote(null);
      return;
    }
    setFolderNote({ kind: "info", text: "Reading the project." });
    try {
      const summary = (await TauriApi.scanMultipleProjectDirectories(folders)).trim();
      if (!alive.current) return;
      set({ context: summary });
      setFolderNote(
        summary
          ? { kind: "info", text: `Read ${folders.length} ${folders.length === 1 ? "folder" : "folders"}. Answers can refer to this code.` }
          : { kind: "problem", text: "Nothing readable was found in that folder." }
      );
    } catch (err) {
      if (alive.current) setFolderNote({ kind: "problem", text: messageOf(err) });
    }
  };

  const addFolder = async () => {
    if (busy) return;
    setBusy("folder");
    try {
      const chosen = (await TauriApi.selectDirectoryDialog())?.trim();
      if (!chosen || !alive.current) return;
      if (draft.folders.includes(chosen)) {
        setFolderNote({ kind: "info", text: "That folder is already in the list." });
        return;
      }
      const folders = [...draft.folders, chosen];
      set({ folders });
      await scan(folders);
    } catch (err) {
      if (alive.current) setFolderNote({ kind: "problem", text: messageOf(err) });
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const removeFolder = async (folder: string) => {
    const folders = draft.folders.filter((f) => f !== folder);
    set({ folders });
    await scan(folders);
  };

  const readFile = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy("file");
    setFileNote({ kind: "info", text: `Reading ${file.name}.` });
    try {
      const text = (await extractTextFromFile(file)).trim();
      if (!alive.current) return;
      if (text.length > 10) {
        set({ resume: text });
        setFileNote({ kind: "info", text: `Filled in from ${file.name}. Edit it freely.` });
      } else {
        setFileNote({ kind: "problem", text: `No readable text was found in ${file.name}. Paste your background instead.` });
      }
    } catch {
      if (alive.current) {
        setFileNote({ kind: "problem", text: `${file.name} could not be read. Try a PDF, Word or text file, or paste instead.` });
      }
    } finally {
      if (alive.current) setBusy(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const start = () => {
    if (created.current) return;
    created.current = true;
    const role = draft.role.trim();
    const company = draft.company.trim();
    try {
      localStorage.removeItem(NEW_INTERVIEW_DRAFT_KEY);
    } catch {
      // Nothing to clear.
    }
    onCreate({
      title: company ? `${role} at ${company}` : role,
      role,
      company: company || undefined,
      jobDescription: draft.jobDescription.trim(),
      candidateResume: draft.resume.trim(),
      projectDirectory: draft.folders[0] || undefined,
      projectDirectories: draft.folders,
      projectContext: draft.context.trim() || undefined,
    });
  };

  return (
    <main className="flex h-screen w-screen flex-col bg-g-base text-g-text">
      <WindowBar title="New interview" />

      <header className="shrink-0 border-b border-g-line px-8 pb-4 pt-5">
        <div className="mx-auto max-w-2xl">
        <p className="text-xs text-g-muted">Step {draft.step} of 2</p>
        <h1 className="mt-1 text-xl font-semibold tracking-[-0.01em]">{draft.step === 1 ? "The role" : "About you"}</h1>
        <p className="mt-1 max-w-prose text-sm leading-6 text-g-muted">
          {draft.step === 1
            ? "Answers are written for this job. The more of the posting you paste, the closer they fit."
            : "Answers speak as you. Give them your real experience to draw on. Both parts are optional."}
        </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-2xl">
          <StepTransition stepKey={String(draft.step)} direction={direction}>
            {draft.step === 1 ? (
              <div className="space-y-5">
                <Field label="Role" error={roleError}>
                  {(props) => (
                    <TextInput
                      {...props}
                      value={draft.role}
                      autoFocus
                      placeholder="For example: Backend engineer"
                      onChange={(e) => {
                        set({ role: e.target.value });
                        if (roleError) setRoleError(null);
                      }}
                    />
                  )}
                </Field>
                <Field label="Company" hint="Optional.">
                  {(props) => <TextInput {...props} value={draft.company} onChange={(e) => set({ company: e.target.value })} />}
                </Field>
                <Field label="Job description" hint="Optional. Paste the posting.">
                  {(props) => (
                    <TextArea
                      {...props}
                      rows={5}
                      value={draft.jobDescription}
                      onChange={(e) => set({ jobDescription: e.target.value })}
                    />
                  )}
                </Field>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Field label="Your background" hint="Paste a resume, or a few lines about your experience.">
                    {(props) => (
                      <TextArea {...props} rows={5} value={draft.resume} onChange={(e) => set({ resume: e.target.value })} />
                    )}
                  </Field>
                  <div className="flex items-center gap-3">
                    <Button size="sm" busy={busy === "file"} onClick={() => fileInput.current?.click()}>
                      Read from a file
                    </Button>
                    {fileNote && <Notice kind={fileNote.kind}>{fileNote.text}</Notice>}
                  </div>
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".pdf,.docx,.txt,.md"
                    className="hidden"
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={(e) => void readFile(e.target.files?.[0])}
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-[13px] font-medium text-g-text">Your code</p>
                  <p className="text-[13px] leading-5 text-g-muted">
                    Add a project folder to let answers refer to code you wrote. File names and key files are read on
                    this computer and sent with your questions.
                  </p>
                  {draft.folders.length > 0 && (
                    <ul className="divide-y divide-g-line rounded-md border border-g-line">
                      {draft.folders.map((folder) => (
                        <li key={folder} className="flex min-h-10 items-center gap-3 px-3 py-1">
                          <span className="min-w-0 flex-1 select-text truncate font-mono text-[13px]">{folder}</span>
                          <Button size="sm" variant="ghost" aria-label={`Remove ${folder}`} onClick={() => void removeFolder(folder)}>
                            Remove
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex items-center gap-3">
                    <Button size="sm" busy={busy === "folder"} onClick={() => void addFolder()}>
                      Add a project folder
                    </Button>
                    {folderNote && <Notice kind={folderNote.kind}>{folderNote.text}</Notice>}
                  </div>
                </div>
              </div>
            )}
          </StepTransition>
        </div>
      </div>

      <footer className="shrink-0 border-t border-g-line px-8 py-4">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <span className="ml-auto" />
        {draft.step === 1 ? (
          <Button variant="primary" onClick={() => move(2)}>
            Continue
          </Button>
        ) : (
          <>
            <Button onClick={() => move(1)}>Back</Button>
            <Button variant="primary" onClick={start}>
              Start interview
            </Button>
          </>
        )}
        </div>
      </footer>
    </main>
  );
};
