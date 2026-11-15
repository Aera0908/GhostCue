import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

type Listener = (event: { payload: unknown }) => void;
const listeners = new Map<string, Set<Listener>>();
vi.mock("@tauri-apps/api/event", () => ({
  listen: (name: string, handler: Listener) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name)!.add(handler);
    return Promise.resolve(() => listeners.get(name)!.delete(handler));
  },
}));

function emit(name: string, payload: unknown) {
  act(() => {
    listeners.get(name)?.forEach((h) => h({ payload }));
  });
}

import { SetupFlow, shouldShowSetup, SETUP_STORAGE_KEY } from "./SetupFlow";
import { DEFAULT_CONFIG } from "../../services/tauriApi";
import type { AppConfig } from "../../types/config";

type Handler = (args: Record<string, unknown>) => unknown;
let keys: Record<string, boolean> = {};

function backend(extra: Record<string, Handler> = {}) {
  const handlers: Record<string, Handler> = {
    get_key_status: () => keys,
    list_provider_models: () => [{ id: "llama-test", vision: null }],
    get_available_whisper_models: () => [{ name: "base.en", size: "142 MB", downloaded: true, path: "C:\\m\\base.bin" }],
    get_audio_devices: () => ({
      inputs: [{ id: "mic-1", name: "Desk microphone", is_default: true, is_input: true, channels: 1, sample_rate: 48000 }],
      outputs: [{ id: "out-1", name: "Headphones", is_default: true, is_input: false, channels: 2, sample_rate: 48000 }],
    }),
    start_audio_capture: () => true,
    stop_audio_capture: () => true,
    ...extra,
  };
  invoke.mockImplementation((cmd: string, args: Record<string, unknown>) => {
    const handler = handlers[cmd];
    if (!handler) return Promise.reject(new Error(`unexpected command ${cmd}`));
    try {
      return Promise.resolve(handler(args ?? {}));
    } catch (e) {
      return Promise.reject(e);
    }
  });
}

const callsTo = (cmd: string) => invoke.mock.calls.filter((c) => c[0] === cmd);
const ready: AppConfig = { ...DEFAULT_CONFIG, llm_provider: "groq", groq_model: "llama-test", stt_provider: "local_whisper" };

beforeEach(() => {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  invoke.mockReset();
  listeners.clear();
  localStorage.clear();
  keys = { groq: true };
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe("shouldShowSetup", () => {
  it("shows setup to a new user only", () => {
    expect(shouldShowSetup(0)).toBe(true);
    localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify({ step: 1, done: false }));
    expect(shouldShowSetup(0)).toBe(true);
    localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify({ step: 2, done: true }));
    expect(shouldShowSetup(0)).toBe(false);
  });

  it("existing_users_skip_setup", () => {
    expect(shouldShowSetup(3)).toBe(false);
    localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify({ step: 1, done: false }));
    expect(shouldShowSetup(1)).toBe(false);
  });

  it("treats unreadable saved progress as a fresh start", () => {
    for (const bad of ["{", "null", "[]", '"x"', '{"step":"two"}', '{"step":99}']) {
      localStorage.setItem(SETUP_STORAGE_KEY, bad);
      expect(shouldShowSetup(0)).toBe(true);
    }
  });
});

describe("SetupFlow", () => {
  it("starts with the answer provider and will not continue until it is usable", async () => {
    keys = { groq: false };
    backend();
    render(<SetupFlow config={ready} onChange={vi.fn().mockResolvedValue(undefined)} onDone={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "Where answers come from" })).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    await screen.findByLabelText("Groq API key");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  });

  it("moves one step on a double click and remembers where it is", async () => {
    backend();
    const user = userEvent.setup();
    const { unmount } = render(<SetupFlow config={ready} onChange={vi.fn().mockResolvedValue(undefined)} onDone={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled());
    await user.dblClick(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { name: "How GhostCue listens" })).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
    expect(callsTo("start_audio_capture")).toHaveLength(0);

    // setup_resumes_where_it_stopped
    unmount();
    render(<SetupFlow config={ready} onChange={vi.fn().mockResolvedValue(undefined)} onDone={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "How GhostCue listens" })).toBeInTheDocument();
  });

  it("goes back without losing the step it came from", async () => {
    localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify({ step: 2, done: false }));
    backend();
    const user = userEvent.setup();
    render(<SetupFlow config={ready} onChange={vi.fn().mockResolvedValue(undefined)} onDone={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Back" }));

    expect(await screen.findByRole("heading", { name: "Where answers come from" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(SETUP_STORAGE_KEY)!)).toEqual({ step: 1, done: false });
  });

  it("will not leave the listening step while nothing can transcribe", async () => {
    localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify({ step: 2, done: false }));
    backend({ get_available_whisper_models: () => [{ name: "base.en", size: "142 MB", downloaded: false, path: "" }] });
    render(<SetupFlow config={ready} onChange={vi.fn().mockResolvedValue(undefined)} onDone={vi.fn()} />);

    await screen.findByRole("button", { name: "Download base.en" });
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("runs the microphone only during the sound check and shows what it heard", async () => {
    localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify({ step: 3, done: false }));
    backend();
    const onDone = vi.fn();
    const user = userEvent.setup();
    const { unmount } = render(<SetupFlow config={ready} onChange={vi.fn().mockResolvedValue(undefined)} onDone={onDone} />);

    expect(await screen.findByRole("heading", { name: "Sound check" })).toBeInTheDocument();
    await waitFor(() => expect(callsTo("start_audio_capture")).toHaveLength(1));
    expect(screen.getByText("Say something. Nothing heard from the microphone yet.")).toBeInTheDocument();

    emit("audio-mic-level", { level: 0.4, active: true, speaker: "Candidate" });
    expect(await screen.findByText("Your microphone is being heard.")).toBeInTheDocument();
    expect(screen.getByText(/Play any sound on this computer/)).toBeInTheDocument();
    emit("audio-loopback-level", { level: 0.3, active: true, speaker: "Interviewer" });
    expect(await screen.findByText("Sound from this computer is being heard.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(SETUP_STORAGE_KEY)!).done).toBe(true);

    unmount();
    await waitFor(() => expect(callsTo("stop_audio_capture").length).toBeGreaterThanOrEqual(1));
  });

  it("reports a microphone that cannot be opened instead of showing an empty meter", async () => {
    localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify({ step: 3, done: false }));
    backend({
      start_audio_capture: () => {
        throw "No input device available";
      },
    });
    render(<SetupFlow config={ready} onChange={vi.fn().mockResolvedValue(undefined)} onDone={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No input device available");
    expect(screen.getByRole("button", { name: "Finish" })).toBeEnabled();
  });

  it("can be left for later from any step", async () => {
    keys = {};
    backend();
    const onDone = vi.fn();
    render(<SetupFlow config={ready} onChange={vi.fn().mockResolvedValue(undefined)} onDone={onDone} />);

    await userEvent.setup().click(await screen.findByRole("button", { name: "Set up later" }));

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(shouldShowSetup(0)).toBe(false);
  });
});
