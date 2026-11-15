import React, { useCallback, useEffect, useRef, useState } from "react";
import { KeyId, ModelInfo, ProviderTestResult, TauriApi } from "../../services/tauriApi";
import type { AppConfig } from "../../types/config";
import { SecretField } from "../../components/settings/SecretField";
import { Button } from "../../ui/Button";
import { ChoiceList } from "../../ui/ChoiceList";
import { Field, Select, TextInput } from "../../ui/Field";
import { Notice } from "../../ui/Notice";
import { keyIsReady, PROVIDERS, providerBySlug, ProviderMeta } from "./providers";

interface ProviderSetupProps {
  config: AppConfig;
  /** Saves the change. Settings are saved as they are made, so a test always uses what is on screen. */
  onChange: (patch: Partial<AppConfig>) => Promise<void>;
  /** Told whenever the selected provider becomes usable or stops being usable. */
  onReadyChange?: (ready: boolean) => void;
}

type KeyStatus = Partial<Record<KeyId, boolean>>;

function messageOf(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return "Something went wrong. Try again.";
}

function keyState(meta: ProviderMeta, keys: KeyStatus | null): string {
  if (!meta.keyId) return "No key needed";
  if (!keys) return "";
  if (keys[meta.keyId]) return "Key saved";
  return meta.keyOptional ? "Key optional" : "Needs a key";
}

export const ProviderSetup: React.FC<ProviderSetupProps> = ({ config, onChange, onReadyChange }) => {
  const [keys, setKeys] = useState<KeyStatus | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    TauriApi.getKeyStatus()
      .then((status) => alive.current && setKeys(status))
      .catch(() => alive.current && setKeys({}));
    return () => {
      alive.current = false;
    };
  }, []);

  const selected = providerBySlug(config.llm_provider);

  const savedModel = selected ? String(config[selected.modelField] ?? "").trim() : "";
  const savedAddress = selected?.endpointField ? String(config[selected.endpointField] ?? "").trim() : "-";
  const ready = !!selected && keys !== null && keyIsReady(selected, keys) && savedModel !== "" && savedAddress !== "";
  useEffect(() => {
    onReadyChange?.(ready);
  }, [ready, onReadyChange]);

  const choose = (slug: string) => {
    if (slug === config.llm_provider) return;
    setSaveError(null);
    onChange({ llm_provider: slug }).catch((err) => alive.current && setSaveError(messageOf(err)));
  };

  return (
    <div className="space-y-6">
      <ChoiceList
        legend="Answer provider"
        name="answer-provider"
        value={selected?.slug}
        onChange={choose}
        choices={PROVIDERS.map((meta) => ({
          value: meta.slug,
          title: meta.name,
          detail: meta.blurb,
          state: keyState(meta, keys),
        }))}
      />

      {saveError && <Notice kind="problem">{saveError}</Notice>}

      {selected && (
        <ProviderDetail
          key={selected.slug}
          meta={selected}
          config={config}
          keys={keys}
          onChange={onChange}
          onKeyStored={(has) => selected.keyId && setKeys((prev) => ({ ...(prev ?? {}), [selected.keyId!]: has }))}
        />
      )}
    </div>
  );
};

interface DetailProps {
  meta: ProviderMeta;
  config: AppConfig;
  keys: KeyStatus | null;
  onChange: (patch: Partial<AppConfig>) => Promise<void>;
  onKeyStored: (has: boolean) => void;
}

type Models =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "loaded"; items: ModelInfo[] }
  | { state: "failed"; error: string };

type TestState = { state: "idle" } | { state: "running" } | { state: "done"; result: ProviderTestResult };

/**
 * Everything for one provider. It is remounted when the provider changes, so a slow
 * reply for the previous provider has nowhere to land.
 */
const ProviderDetail: React.FC<DetailProps> = ({ meta, config, keys, onChange, onKeyStored }) => {
  const savedModel = (config[meta.modelField] as string | undefined) ?? "";
  const savedEndpoint = meta.endpointField ? ((config[meta.endpointField] as string | undefined) ?? "") : "";

  const [model, setModel] = useState(savedModel);
  const [endpoint, setEndpoint] = useState(savedEndpoint);
  const [models, setModels] = useState<Models>({ state: "idle" });
  const [typing, setTyping] = useState(false);
  const [reload, setReload] = useState(0);
  const [test, setTest] = useState<TestState>({ state: "idle" });
  const [saveError, setSaveError] = useState<string | null>(null);

  const alive = useRef(true);
  const testing = useRef(false);
  // What the backend currently has, so the same value is never saved twice.
  const committed = useRef({ model: savedModel, endpoint: savedEndpoint });
  const saving = useRef<Promise<boolean>>(Promise.resolve(true));

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Follow changes made elsewhere (another screen, a reset) unless the user is mid-edit here.
  useEffect(() => {
    if (committed.current.model !== savedModel) {
      committed.current.model = savedModel;
      setModel(savedModel);
    }
    if (committed.current.endpoint !== savedEndpoint) {
      committed.current.endpoint = savedEndpoint;
      setEndpoint(savedEndpoint);
    }
  }, [savedModel, savedEndpoint]);

  const keyReady = keyIsReady(meta, keys);
  const addressReady = !meta.endpointField || committed.current.endpoint.trim() !== "" || endpoint.trim() !== "";
  const canList = keys !== null && keyReady && addressReady;

  useEffect(() => {
    if (!canList) {
      setModels({ state: "idle" });
      return;
    }
    let current = true;
    setModels({ state: "loading" });
    TauriApi.listProviderModels(meta.slug)
      .then((items) => current && alive.current && setModels({ state: "loaded", items }))
      .catch((err) => current && alive.current && setModels({ state: "failed", error: messageOf(err) }));
    return () => {
      current = false;
    };
  }, [meta.slug, canList, reload]);

  /** Saves one field if it changed. Saves run one after another. Resolves false when a save failed. */
  const commit = useCallback(
    (which: "model" | "endpoint", raw: string): Promise<boolean> => {
      const value = raw.trim();
      const field = which === "model" ? meta.modelField : meta.endpointField;
      saving.current = saving.current.then(async () => {
        if (!field || committed.current[which] === value) return true;
        try {
          await onChange({ [field]: value } as Partial<AppConfig>);
          committed.current[which] = value;
          if (alive.current) {
            setSaveError(null);
            if (which === "endpoint") setReload((n) => n + 1);
          }
          return true;
        } catch (err) {
          if (alive.current) setSaveError(messageOf(err));
          return false;
        }
      });
      return saving.current;
    },
    [meta.modelField, meta.endpointField, onChange]
  );

  const runTest = async () => {
    if (testing.current) return;
    testing.current = true;
    setTest({ state: "running" });
    try {
      const saved = (await commit("endpoint", endpoint)) && (await commit("model", model));
      if (!saved) {
        if (alive.current) setTest({ state: "idle" });
        return;
      }
      const result = await TauriApi.testLlmProvider(meta.slug);
      if (alive.current) setTest({ state: "done", result });
    } catch (err) {
      if (alive.current) {
        setTest({
          state: "done",
          result: { ok: false, kind: null, message: messageOf(err), model: "", latency_ms: 0 },
        });
      }
    } finally {
      testing.current = false;
    }
  };

  const listed = models.state === "loaded" ? models.items : [];
  const showList = listed.length > 0 && !typing;
  const options = listed.some((m) => m.id === model) || !model ? listed : [{ id: model, vision: null }, ...listed];
  const nothingInstalled = meta.slug === "ollama" && models.state === "loaded" && listed.length === 0;
  const canTest = keyReady && addressReady && model.trim() !== "";

  return (
    <div className="space-y-5">
      {meta.keyId && (
        <div className="space-y-1.5">
          <SecretField
            keyId={meta.keyId}
            label={`${meta.name === "Custom endpoint" ? "Custom endpoint" : meta.name} API key`}
            placeholder={meta.keyPlaceholder}
            onStored={onKeyStored}
          />
          {meta.keyPage && (
            <p className="text-[13px] text-g-muted">
              Keys are created at{" "}
              <a
                href={meta.keyPage}
                target="_blank"
                rel="noreferrer"
                className="rounded-sm text-g-text underline decoration-g-lineStrong underline-offset-2 hover:decoration-g-accent active:text-g-accent"
              >
                {new URL(meta.keyPage).host}
              </a>
              . The key is stored in Windows Credential Manager.
            </p>
          )}
        </div>
      )}

      {meta.endpointField && (
        <Field label="Server address">
          {(props) => (
            <TextInput
              {...props}
              value={endpoint}
              spellCheck={false}
              placeholder={meta.endpointPlaceholder}
              className="font-mono text-[13px]"
              onChange={(e) => setEndpoint(e.target.value)}
              onBlur={() => void commit("endpoint", endpoint)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commit("endpoint", endpoint);
              }}
            />
          )}
        </Field>
      )}

      <div className="space-y-1.5">
        <Field label="Model">
          {(props) =>
            showList ? (
              <Select
                {...props}
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  void commit("model", e.target.value);
                }}
              >
                {!model && <option value="">Choose a model</option>}
                {options.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </Select>
            ) : (
              <TextInput
                {...props}
                value={model}
                spellCheck={false}
                placeholder="Model name, exactly as the provider writes it"
                className="font-mono text-[13px]"
                onChange={(e) => setModel(e.target.value)}
                onBlur={() => void commit("model", model)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commit("model", model);
                }}
              />
            )
          }
        </Field>

        {models.state === "loading" && <Notice kind="info">Loading the model list from {meta.name}.</Notice>}
        {models.state === "failed" && (
          <Notice kind="problem">{models.error} You can still type a model name.</Notice>
        )}
        {nothingInstalled && (
          <Notice kind="info">
            Ollama is running but has no models installed. In a terminal run{" "}
            <code className="select-text font-mono text-g-text">ollama pull</code> followed by a model name, then
            refresh.
          </Notice>
        )}
        {!keyReady && keys !== null && <Notice kind="info">Save a key to load {meta.name}'s models.</Notice>}

        <div className="flex gap-2 pt-0.5">
          {listed.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setTyping((t) => !t)}>
              {typing ? "Choose from the list" : "Type a name instead"}
            </Button>
          )}
          {canList && models.state !== "loading" && (
            <Button variant="ghost" size="sm" onClick={() => setReload((n) => n + 1)}>
              Refresh list
            </Button>
          )}
        </div>
      </div>

      {saveError && <Notice kind="problem">{saveError}</Notice>}

      <div className="flex items-start gap-3 border-t border-g-line pt-4">
        <Button variant="secondary" onClick={() => void runTest()} disabled={!canTest} busy={test.state === "running"}>
          {test.state === "running" ? "Testing" : "Test"}
        </Button>
        <div className="min-h-9 flex-1 pt-2">
          {test.state === "idle" && (
            <Notice kind="info">Sends one short request to {meta.name} with these settings.</Notice>
          )}
          {test.state === "running" && <Notice kind="info">Waiting for {meta.name} to answer.</Notice>}
          {test.state === "done" &&
            (test.result.ok ? (
              <Notice kind="good">
                {test.result.message} ({(test.result.latency_ms / 1000).toFixed(1)} s)
              </Notice>
            ) : (
              <Notice kind="problem">{test.result.message}</Notice>
            ))}
        </div>
      </div>
    </div>
  );
};
