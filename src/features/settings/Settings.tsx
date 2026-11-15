import React, { useEffect, useId, useRef, useState } from "react";
import { DEFAULT_CONFIG } from "../../services/tauriApi";
import type { AppConfig } from "../../types/config";
import { RESPONSE_LANGUAGES, SUPPORTED_LANGUAGES } from "../../i18n";
import { Button } from "../../ui/Button";
import { Field, Select, TextArea, TextInput } from "../../ui/Field";
import { Notice } from "../../ui/Notice";
import { Switch } from "../../ui/Switch";
import { WindowBar } from "../../ui/WindowBar";
import { ProviderSetup } from "../providers/ProviderSetup";
import { providerBySlug } from "../providers/providers";
import { ListeningSetup } from "../listening/ListeningSetup";
import { SoundCheck } from "../setup/SoundCheck";
import type { SettingsSection } from "../home/Home";

type Section = SettingsSection | "automatic" | "shortcuts";

interface SettingsProps {
  config: AppConfig;
  /** Saves the change. Every control saves as it is used; there is nothing to confirm at the end. */
  onChange: (patch: Partial<AppConfig>) => Promise<void>;
  onClose: () => void;
  onRunSetup: () => void;
  inLiveHud: boolean;
  initialSection?: Section;
}

const SECTIONS: Array<[Section, string]> = [
  ["answers", "Answers"],
  ["listening", "Listening"],
  ["sound", "Sound"],
  ["automatic", "Automatic answers"],
  ["window", "Window and privacy"],
  ["language", "Language"],
  ["shortcuts", "Shortcuts"],
];

const SHORTCUTS: Array<[keys: string, what: string]> = [
  ["Ctrl + Shift + Space", "Answer the last question"],
  ["Ctrl + Shift + K", "Write code for the last question"],
  ["Ctrl + Shift + L", "Suggest a clarifying question"],
  ["Ctrl + Shift + E", "Go deeper on the last answer"],
  ["Ctrl + Shift + S", "Read the screen and answer"],
  ["Ctrl + Shift + O", "Turn automatic screen reading on or off"],
  ["Ctrl + Shift + T", "Type the latest code into the focused window"],
  ["Esc", "Stop the answer being written"],
  ["Ctrl + Shift + P", "Pause or resume listening"],
  ["Ctrl + Shift + H", "Hide or show the window"],
  ["Ctrl + Shift + C", "Let clicks pass through the window"],
  ["Ctrl + Shift + M", "Mute or unmute your microphone"],
  ["Ctrl + ,", "Open settings"],
];

function messageOf(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return "Something went wrong. Try again.";
}

interface RangeProps {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onCommit: (value: number) => void;
}

/** Moves freely while dragged and saves once, when it is let go. */
const Range: React.FC<RangeProps> = ({ label, hint, value, min, max, step, format, onCommit }) => {
  const id = useId();
  const hintId = useId();
  const [local, setLocal] = useState(value);
  const latest = useRef(value);
  // What has already been handed to onCommit, so release followed by blur saves once.
  const committed = useRef(value);

  useEffect(() => {
    setLocal(value);
    latest.current = value;
    committed.current = value;
  }, [value]);

  const commit = () => {
    if (latest.current === committed.current) return;
    committed.current = latest.current;
    onCommit(latest.current);
  };

  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="text-sm text-g-text">
          {label}
        </label>
        <span className="font-mono text-[13px] tabular-nums text-g-muted">{format(local)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={local}
        aria-describedby={hint ? hintId : undefined}
        aria-valuetext={format(local)}
        className="mt-2 h-1.5 w-full cursor-pointer accent-g-accent"
        onChange={(e) => {
          const next = Number(e.target.value);
          latest.current = next;
          setLocal(next);
        }}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      {hint && (
        <p id={hintId} className="mt-1 text-[13px] leading-5 text-g-muted">
          {hint}
        </p>
      )}
    </div>
  );
};

interface SavedTextProps {
  label: string;
  hint?: string;
  value: string;
  rows?: number;
  mono?: boolean;
  placeholder?: string;
  onCommit: (value: string) => void;
}

/** Text that is saved when the field is left, if it changed. */
const SavedText: React.FC<SavedTextProps> = ({ label, hint, value, rows, mono, placeholder, onCommit }) => {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const commit = () => {
    if (local.trim() !== value.trim()) onCommit(local.trim());
  };
  return (
    <Field label={label} hint={hint}>
      {(props) =>
        rows ? (
          <TextArea {...props} rows={rows} value={local} placeholder={placeholder} onChange={(e) => setLocal(e.target.value)} onBlur={commit} />
        ) : (
          <TextInput
            {...props}
            value={local}
            placeholder={placeholder}
            spellCheck={!mono}
            className={mono ? "font-mono text-[13px]" : ""}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={commit}
          />
        )
      }
    </Field>
  );
};

const Rows: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="divide-y divide-g-line border-y border-g-line">{children}</div>
);

export const Settings: React.FC<SettingsProps> = ({ config, onChange, onClose, onRunSetup, inLiveHud, initialSection }) => {
  const [section, setSection] = useState<Section>(initialSection ?? "answers");
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** Saves and reports failure. Controls show the saved value, so a failed save is never shown as done. */
  const save = (patch: Partial<AppConfig>): Promise<void> => {
    setError(null);
    return onChange(patch).catch((err) => {
      if (alive.current) setError(messageOf(err));
      throw err;
    });
  };
  const set = (patch: Partial<AppConfig>) => void save(patch).catch(() => {});

  const provider = providerBySlug(config.llm_provider);
  const title = SECTIONS.find(([id]) => id === section)?.[1] ?? "";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-g-base text-g-text" role="dialog" aria-modal="true" aria-label="Settings">
      <WindowBar title="Settings">
        <Button variant="primary" size="sm" onClick={onClose}>
          Done
        </Button>
      </WindowBar>

      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <nav
          aria-label="Settings sections"
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-g-line p-2 sm:w-48 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r sm:p-3"
        >
          {SECTIONS.map(([id, name]) => (
            <button
              key={id}
              type="button"
              aria-current={section === id ? "page" : undefined}
              onClick={() => {
                setSection(id);
                setError(null);
                setConfirmingReset(false);
              }}
              className={
                "shrink-0 rounded-md px-3 py-1.5 text-left text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-g-accent " +
                (section === id ? "bg-g-raised font-medium text-g-text" : "text-g-muted hover:bg-g-hover hover:text-g-text active:bg-g-base")
              }
            >
              {name}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-8">
          <div className="mx-auto max-w-2xl space-y-5">
            <div>
              <h1 className="text-lg font-semibold tracking-[-0.01em]">{title}</h1>
              <p className="mt-0.5 text-[13px] text-g-muted">Changes are saved as you make them.</p>
            </div>

            {error && <Notice kind="problem">{error}</Notice>}

            {section === "answers" && (
              <div className="space-y-6">
                <ProviderSetup config={config} onChange={save} />
                <div className="space-y-4 border-t border-g-line pt-5">
                  <Field label="Answer in" hint="The language answers are written in.">
                    {(props) => (
                      <Select {...props} value={config.response_language ?? "auto"} onChange={(e) => set({ response_language: e.target.value })}>
                        {RESPONSE_LANGUAGES.map((l) => (
                          <option key={l.code} value={l.code}>
                            {l.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <SavedText
                    label="Extra instructions for every answer"
                    hint="Optional. Added to what the model is told before each answer."
                    rows={3}
                    value={config.system_prompt_override ?? ""}
                    onCommit={(value) => set({ system_prompt_override: value })}
                  />
                  {provider && (
                    <div>
                      <Switch
                        label="Use a different model for code and screen questions"
                        description={`Other questions keep using the ${provider.name} model chosen above.`}
                        checked={config.smart_model_routing === true}
                        onChange={(next) => set({ smart_model_routing: next })}
                      />
                      {config.smart_model_routing && (
                        <SavedText
                          label="Model for code and screen questions"
                          hint={`A ${provider.name} model name. Leave empty to use the same model for everything.`}
                          mono
                          value={config.code_models?.[provider.slug] ?? ""}
                          onCommit={(value) => set({ code_models: { ...(config.code_models ?? {}), [provider.slug]: value } })}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {section === "listening" && (
              <div className="space-y-6">
                <ListeningSetup config={config} onChange={save} />
                <Rows>
                  <Range
                    label="How loud speech must be"
                    hint="Raise this if background noise is being transcribed."
                    value={config.vad_sensitivity}
                    min={0.05}
                    max={0.95}
                    step={0.05}
                    format={(v) => `${Math.round(v * 100)}%`}
                    onCommit={(v) => set({ vad_sensitivity: v })}
                  />
                  <Range
                    label="Pause that ends a sentence"
                    hint="A longer pause waits for slow speakers. A shorter one answers sooner."
                    value={config.vad_silence_cutoff_ms}
                    min={200}
                    max={3500}
                    step={50}
                    format={(v) => `${(v / 1000).toFixed(2)} s`}
                    onCommit={(v) => set({ vad_silence_cutoff_ms: v })}
                  />
                </Rows>
              </div>
            )}

            {section === "sound" && <SoundCheck config={config} onChange={save} manageCapture={!inLiveHud} />}

            {section === "automatic" && (
              <Rows>
                <Switch
                  label="Answer questions without being asked"
                  description="When the interviewer finishes a question, an answer starts on its own."
                  checked={config.auto_trigger_enabled}
                  onChange={(next) => set({ auto_trigger_enabled: next })}
                />
                <Range
                  label="Wait before answering"
                  hint="Time allowed for the interviewer to keep talking."
                  value={config.auto_trigger_delay_ms ?? 1500}
                  min={100}
                  max={4000}
                  step={50}
                  format={(v) => `${(v / 1000).toFixed(2)} s`}
                  onCommit={(v) => set({ auto_trigger_delay_ms: v })}
                />
                <Switch
                  label="Read the screen during the interview"
                  description="Takes a picture of the screen at intervals so answers can refer to what is on it."
                  checked={config.live_ocr_enabled === true}
                  onChange={(next) => set({ live_ocr_enabled: next })}
                />
                <Range
                  label="Time between screen readings"
                  value={config.live_ocr_interval_secs ?? 10}
                  min={4}
                  max={60}
                  step={1}
                  format={(v) => `${v} s`}
                  onCommit={(v) => set({ live_ocr_interval_secs: v })}
                />
                <Switch
                  label="Skip readings when the screen has not changed"
                  checked={config.live_ocr_smart_diff !== false}
                  onChange={(next) => set({ live_ocr_smart_diff: next })}
                />
              </Rows>
            )}

            {section === "window" && (
              <div className="space-y-6">
                <Rows>
                  <Switch
                    label="Hide from screen capture"
                    description="The window is left out of screen sharing and recordings on this computer."
                    checked={config.anti_capture_enabled}
                    onChange={(next) => set({ anti_capture_enabled: next })}
                  />
                  <Switch
                    label="Do not take keyboard focus"
                    description="During an interview, clicking the window leaves the cursor in the app you were using."
                    checked={config.focus_shield_enabled !== false}
                    onChange={(next) => set({ focus_shield_enabled: next })}
                  />
                  <Range
                    label="Window opacity"
                    value={config.opacity}
                    min={0.2}
                    max={1}
                    step={0.02}
                    format={(v) => `${Math.round(v * 100)}%`}
                    onCommit={(v) => set({ opacity: v })}
                  />
                  <Range
                    label="Text size"
                    value={config.font_size ?? 14}
                    min={12}
                    max={22}
                    step={1}
                    format={(v) => `${v} px`}
                    onCommit={(v) => set({ font_size: v })}
                  />
                </Rows>

                <div className="space-y-2">
                  {confirmingReset ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-[13px] text-g-muted">
                        Every setting goes back to how it started. Saved API keys and your interviews are kept.
                      </p>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          setConfirmingReset(false);
                          set(DEFAULT_CONFIG);
                        }}
                      >
                        Reset
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmingReset(false)}>
                        Keep my settings
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" onClick={() => setConfirmingReset(true)}>
                      Reset all settings
                    </Button>
                  )}
                </div>
              </div>
            )}

            {section === "language" && (
              <div className="space-y-4">
                <Field label="Language of the live view" hint="Setup, Home and Settings are in English for now.">
                  {(props) => (
                    <Select {...props} value={config.ui_language ?? "en"} onChange={(e) => set({ ui_language: e.target.value })}>
                      {SUPPORTED_LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.nativeLabel}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
            )}

            {section === "shortcuts" && (
              <div className="space-y-5">
                <dl className="divide-y divide-g-line border-y border-g-line">
                  {SHORTCUTS.map(([keys, what]) => (
                    <div key={keys} className="flex items-baseline justify-between gap-6 py-2">
                      <dt className="text-sm text-g-text">{what}</dt>
                      <dd className="shrink-0 font-mono text-[13px] text-g-muted">{keys}</dd>
                    </div>
                  ))}
                </dl>
                <Button size="sm" onClick={onRunSetup}>
                  Run setup again
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
