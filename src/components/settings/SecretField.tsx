import React, { useEffect, useId, useRef, useState } from "react";
import { KeyId, TauriApi } from "../../services/tauriApi";
import { Button } from "../../ui/Button";
import { TextInput } from "../../ui/Field";

interface SecretFieldProps {
  keyId: KeyId;
  label: string;
  placeholder: string;
  /** Called with true after a key is saved and false after it is removed. */
  onStored?: (hasKey: boolean) => void;
}

type View = "loading" | "saved" | "editing";

function messageOf(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return "Something went wrong. Try again.";
}

/** A key can be saved, replaced or removed. The stored value is never read back into the page. */
export const SecretField: React.FC<SecretFieldProps> = ({ keyId, label, placeholder, onStored }) => {
  const inputId = useId();
  const [view, setView] = useState<View>("loading");
  const [hadKey, setHadKey] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => {
    alive.current = true;
    TauriApi.getKeyStatus()
      .then((status) => {
        if (!alive.current) return;
        setHadKey(status[keyId]);
        setView(status[keyId] ? "saved" : "editing");
      })
      .catch((err) => {
        if (!alive.current) return;
        setError(messageOf(err));
        setView("editing");
      });
    return () => {
      alive.current = false;
    };
  }, [keyId]);

  const run = async (action: () => Promise<void>, onDone: () => void) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
      if (alive.current) onDone();
    } catch (err) {
      if (alive.current) setError(messageOf(err));
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  };

  const canSave = value.trim().length > 0 && !busy;

  const save = () => {
    if (!canSave) return;
    void run(
      () => TauriApi.setProviderKey(keyId, value),
      () => {
        setValue("");
        setHadKey(true);
        setView("saved");
        onStored?.(true);
      }
    );
  };

  const remove = () => {
    void run(
      () => TauriApi.clearProviderKey(keyId),
      () => {
        setValue("");
        setHadKey(false);
        setView("editing");
        onStored?.(false);
      }
    );
  };

  return (
    <div className="space-y-1.5">
      {view === "saved" ? (
        <div className="flex min-h-9 items-center justify-between gap-3">
          <span className="text-[13px] font-medium text-g-text">{label}</span>
          <div className="flex items-center gap-2">
            <span className="mr-1 text-[13px] text-g-good">Saved</span>
            <Button size="sm" disabled={busy} onClick={() => setView("editing")}>
              Replace
            </Button>
            <Button size="sm" variant="danger" disabled={busy} onClick={remove}>
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label htmlFor={inputId} className="block text-[13px] font-medium text-g-text">
            {label}
          </label>
          <div className="flex items-center gap-2">
            <TextInput
              id={inputId}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={value}
              disabled={view === "loading"}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              className="min-w-0 flex-1 font-mono text-[13px]"
            />
            <Button type="submit" variant="primary" disabled={!canSave}>
              Save
            </Button>
            {hadKey && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setValue("");
                  setError(null);
                  setView("saved");
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="text-[13px] leading-5 text-g-danger">
          {error}
        </p>
      )}
    </div>
  );
};
