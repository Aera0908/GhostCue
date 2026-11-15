import React, { useEffect, useRef, useState } from "react";
import { KeyId, TauriApi } from "../../services/tauriApi";
import type { AppConfig } from "../../types/config";
import { SecretField } from "../../components/settings/SecretField";
import { Button } from "../../ui/Button";
import { ChoiceList } from "../../ui/ChoiceList";
import { Field, Select } from "../../ui/Field";
import { Notice } from "../../ui/Notice";

interface ListeningSetupProps {
  config: AppConfig;
  onChange: (patch: Partial<AppConfig>) => Promise<void>;
  /** Told whenever transcription becomes possible or stops being possible. */
  onReadyChange?: (ready: boolean) => void;
}

export interface WhisperModel {
  name: string;
  size: string;
  downloaded?: boolean;
  path?: string;
}

interface Service {
  value: string;
  title: string;
  detail: string;
  keyId: KeyId | null;
  keyLabel?: string;
  keyPlaceholder?: string;
}

export const LISTENING_SERVICES: Service[] = [
  {
    value: "local_whisper",
    title: "On this computer",
    detail: "Whisper runs locally. Works offline after one download, and audio never leaves the machine.",
    keyId: null,
  },
  {
    value: "groq",
    title: "Groq",
    detail: "Whisper on Groq's servers.",
    keyId: "groq",
    keyLabel: "Groq API key",
    keyPlaceholder: "gsk_...",
  },
  {
    value: "deepgram",
    title: "Deepgram",
    detail: "Deepgram's speech service.",
    keyId: "deepgram",
    keyLabel: "Deepgram API key",
    keyPlaceholder: "Deepgram key",
  },
  {
    value: "cloud_whisper",
    title: "OpenAI",
    detail: "OpenAI's Whisper service.",
    keyId: "openai",
    keyLabel: "OpenAI API key",
    keyPlaceholder: "sk-...",
  },
  {
    value: "openrouter",
    title: "OpenRouter",
    detail: "Sends audio to a Gemini model through OpenRouter.",
    keyId: "openrouter",
    keyLabel: "OpenRouter API key",
    keyPlaceholder: "sk-or-v1-...",
  },
];

const SPOKEN_LANGUAGES: Array<[code: string, name: string]> = [
  ["en", "English"],
  ["tl", "Tagalog"],
  ["zh", "Chinese"],
  ["es", "Spanish"],
  ["ja", "Japanese"],
  ["de", "German"],
  ["fr", "French"],
  ["pt", "Portuguese"],
  ["ko", "Korean"],
  ["ru", "Russian"],
  ["hi", "Hindi"],
  ["ar", "Arabic"],
];

const GROQ_TRANSCRIPTION_MODELS = ["whisper-large-v3-turbo", "whisper-large-v3"];

function messageOf(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return "Something went wrong. Try again.";
}

/** Whether transcription can start with these settings. Used to gate Setup and to word the Home status. */
export function listeningReady(
  config: AppConfig,
  keys: Partial<Record<KeyId, boolean>> | null,
  models: WhisperModel[] | null
): boolean {
  const service = LISTENING_SERVICES.find((s) => s.value === config.stt_provider);
  if (!service) return false;
  if (service.keyId) return keys?.[service.keyId] === true;
  return models?.some((m) => m.downloaded) === true;
}

export const ListeningSetup: React.FC<ListeningSetupProps> = ({ config, onChange, onReadyChange }) => {
  const [keys, setKeys] = useState<Partial<Record<KeyId, boolean>> | null>(null);
  const [models, setModels] = useState<WhisperModel[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const inFlight = useRef<string | null>(null);

  useEffect(() => {
    alive.current = true;
    TauriApi.getKeyStatus()
      .then((status) => alive.current && setKeys(status))
      .catch(() => alive.current && setKeys({}));
    TauriApi.getAvailableWhisperModels()
      .then((list) => alive.current && setModels(list as WhisperModel[]))
      .catch((err) => alive.current && setListError(messageOf(err)));

    let stop: (() => void) | undefined;
    let removed = false;
    void TauriApi.onModelDownloadProgress((event) => {
      if (alive.current && event.model === inFlight.current) setProgress(event.progress);
    }).then((off) => {
      if (removed) off();
      else stop = off;
    });
    return () => {
      alive.current = false;
      removed = true;
      stop?.();
    };
  }, []);

  const ready = listeningReady(config, keys, models);
  useEffect(() => {
    onReadyChange?.(ready);
  }, [ready, onReadyChange]);

  const save = (patch: Partial<AppConfig>) => {
    setError(null);
    onChange(patch).catch((err) => alive.current && setError(messageOf(err)));
  };

  const download = async (name: string) => {
    if (inFlight.current) return;
    inFlight.current = name;
    setDownloading(name);
    setProgress(0);
    setError(null);
    try {
      const path = await TauriApi.downloadWhisperModel(name);
      if (!alive.current) return;
      setModels((prev) => prev?.map((m) => (m.name === name ? { ...m, downloaded: true, path } : m)) ?? prev);
      await onChange({ whisper_model_size: name, whisper_model_path: path });
    } catch (err) {
      if (alive.current) setError(messageOf(err));
    } finally {
      inFlight.current = null;
      if (alive.current) setDownloading(null);
    }
  };

  const service = LISTENING_SERVICES.find((s) => s.value === config.stt_provider);
  const chosenLanguages = config.stt_languages?.length ? config.stt_languages : ["en"];

  const toggleLanguage = (code: string) => {
    const next = chosenLanguages.includes(code)
      ? chosenLanguages.filter((c) => c !== code)
      : [...chosenLanguages, code];
    if (next.length === 0) return; // one language must stay selected
    save({ stt_languages: next, stt_language: next.length === 1 ? next[0] : "auto" });
  };

  return (
    <div className="space-y-6">
      <ChoiceList
        legend="Speech to text"
        name="speech-to-text"
        value={service?.value}
        onChange={(value) => save({ stt_provider: value })}
        choices={LISTENING_SERVICES.map((s) => ({ value: s.value, title: s.title, detail: s.detail }))}
      />

      {service?.value === "local_whisper" && (
        <div className="space-y-2">
          <p className="text-[13px] font-medium text-g-text">Whisper model</p>
          {listError && <Notice kind="problem">{listError}</Notice>}
          {models && (
            <ul className="divide-y divide-g-line rounded-md border border-g-line">
              {models.map((m) => {
                const inUse = !!m.downloaded && config.whisper_model_size === m.name;
                return (
                  <li key={m.name} className="flex min-h-11 items-center gap-3 px-3 py-1.5">
                    <span className="font-mono text-[13px] text-g-text">{m.name}</span>
                    <span className="text-xs text-g-muted">{m.size}</span>
                    <span className="ml-auto flex items-center gap-2 text-[13px]">
                      {downloading === m.name ? (
                        <span role="status" className="tabular-nums text-g-muted">
                          Downloading {m.name}, {Math.floor(progress)}%
                        </span>
                      ) : inUse ? (
                        <span className="text-g-good">In use</span>
                      ) : m.downloaded ? (
                        <Button
                          size="sm"
                          aria-label={`Use ${m.name}`}
                          onClick={() => save({ whisper_model_size: m.name, whisper_model_path: m.path ?? "" })}
                        >
                          Use
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          aria-label={`Download ${m.name}`}
                          disabled={downloading !== null}
                          onClick={() => void download(m.name)}
                        >
                          Download
                        </Button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-[13px] leading-5 text-g-muted">
            Smaller models answer sooner. Larger ones make fewer mistakes and need more memory.
          </p>
        </div>
      )}

      {service?.keyId && (
        <SecretField
          key={service.keyId}
          keyId={service.keyId}
          label={service.keyLabel ?? "API key"}
          placeholder={service.keyPlaceholder ?? ""}
          onStored={(has) => setKeys((prev) => ({ ...(prev ?? {}), [service.keyId!]: has }))}
        />
      )}

      {service?.value === "groq" && (
        <Field label="Transcription model">
          {(props) => (
            <Select
              {...props}
              value={config.groq_whisper_model || GROQ_TRANSCRIPTION_MODELS[0]}
              onChange={(e) => save({ groq_whisper_model: e.target.value })}
            >
              {GROQ_TRANSCRIPTION_MODELS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}

      {error && <Notice kind="problem">{error}</Notice>}

      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-g-text">Languages spoken in the interview</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {SPOKEN_LANGUAGES.map(([code, name]) => (
            <label
              key={code}
              className="flex cursor-pointer items-center gap-2 rounded-sm py-0.5 text-[13px] text-g-muted hover:text-g-text has-[:checked]:text-g-text has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-g-accent"
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5 cursor-pointer accent-g-accent"
                checked={chosenLanguages.includes(code)}
                onChange={() => toggleLanguage(code)}
              />
              {name}
            </label>
          ))}
        </div>
        <p className="text-[13px] leading-5 text-g-muted">
          With one language chosen, transcription is told to expect it. With several, the language is detected.
        </p>
      </fieldset>
    </div>
  );
};
