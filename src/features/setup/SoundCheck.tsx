import React, { useEffect, useRef, useState } from "react";
import { TauriApi } from "../../services/tauriApi";
import type { AppConfig } from "../../types/config";
import type { AudioDeviceInfo } from "../../types/audio";
import { Field, Select } from "../../ui/Field";
import { Notice } from "../../ui/Notice";

interface SoundCheckProps {
  config: AppConfig;
  onChange: (patch: Partial<AppConfig>) => Promise<void>;
  /** False while an interview is live: the interview owns the microphone and this only watches. */
  manageCapture?: boolean;
}

/** A level above this counts as sound rather than room noise. */
const HEARD_ABOVE = 0.05;

function messageOf(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return "Something went wrong. Try again.";
}

const Meter: React.FC<{ label: string; level: number }> = ({ label, level }) => (
  <div
    role="meter"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(Math.min(1, Math.max(0, level)) * 100)}
    className="h-1.5 overflow-hidden rounded-full bg-g-line"
  >
    <div
      className="h-full origin-left bg-g-accent transition-transform duration-100 ease-out motion-reduce:transition-none"
      style={{ transform: `scaleX(${Math.min(1, Math.max(0, level))})` }}
    />
  </div>
);

/**
 * Listens for as long as it is on screen, so the two sources an interview needs can be
 * confirmed: your voice, and whatever the computer plays (the interviewer).
 */
export const SoundCheck: React.FC<SoundCheckProps> = ({ config, onChange, manageCapture = true }) => {
  const [inputs, setInputs] = useState<AudioDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<AudioDeviceInfo[]>([]);
  const [mic, setMic] = useState(0);
  const [system, setSystem] = useState(0);
  const [heardMic, setHeardMic] = useState(false);
  const [heardSystem, setHeardSystem] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const stops: Array<() => void> = [];
    let removed = false;
    const keep = (off: () => void) => (removed ? off() : stops.push(off));

    TauriApi.getAudioDevices()
      .then((devices) => {
        if (!alive.current) return;
        setInputs(devices.inputs);
        setOutputs(devices.outputs);
      })
      .catch(() => {});
    void TauriApi.onMicLevel((event) => {
      if (!alive.current) return;
      setMic(event.level);
      if (event.level > HEARD_ABOVE) setHeardMic(true);
    }).then(keep);
    void TauriApi.onLoopbackLevel((event) => {
      if (!alive.current) return;
      setSystem(event.level);
      if (event.level > HEARD_ABOVE) setHeardSystem(true);
    }).then(keep);
    if (manageCapture) {
      TauriApi.startAudioCapture().catch((err) => alive.current && setError(messageOf(err)));
    }

    return () => {
      alive.current = false;
      removed = true;
      stops.forEach((off) => off());
      if (manageCapture) TauriApi.stopAudioCapture().catch(() => {});
    };
  }, [manageCapture]);

  const pick = async (patch: Partial<AppConfig>) => {
    setError(null);
    try {
      await onChange(patch);
      if (manageCapture) {
        // The capture reads its devices when it starts.
        await TauriApi.stopAudioCapture();
        await TauriApi.startAudioCapture();
      }
      if (alive.current) {
        setHeardMic(false);
        setHeardSystem(false);
      }
    } catch (err) {
      if (alive.current) setError(messageOf(err));
    }
  };

  return (
    <div className="space-y-6">
      {error && <Notice kind="problem">{error}</Notice>}

      <section className="space-y-2.5">
        <Field label="Your microphone">
          {(props) => (
            <Select
              {...props}
              value={config.audio_input_device ?? ""}
              onChange={(e) => void pick({ audio_input_device: e.target.value || null })}
            >
              <option value="">Windows default</option>
              {inputs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Meter label="Microphone level" level={mic} />
        <Notice kind={heardMic ? "good" : "info"}>
          {heardMic ? "Your microphone is being heard." : "Say something. Nothing heard from the microphone yet."}
        </Notice>
      </section>

      <section className="space-y-2.5">
        <Field label="Where the interviewer's voice plays">
          {(props) => (
            <Select
              {...props}
              value={config.audio_output_device ?? ""}
              onChange={(e) => void pick({ audio_output_device: e.target.value || null })}
            >
              <option value="">Windows default</option>
              {outputs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Meter label="Computer sound level" level={system} />
        <Notice kind={heardSystem ? "good" : "info"}>
          {heardSystem
            ? "Sound from this computer is being heard."
            : "Play any sound on this computer, such as a video. Nothing heard yet."}
        </Notice>
      </section>
    </div>
  );
};
