import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

type Listener = (event: { payload: unknown }) => void;
const listeners = new Map<string, Set<Listener>>();
const unlisten = vi.fn();
vi.mock("@tauri-apps/api/event", () => ({
  listen: (name: string, handler: Listener) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name)!.add(handler);
    return Promise.resolve(() => {
      unlisten(name);
      listeners.get(name)!.delete(handler);
    });
  },
}));

function emit(name: string, payload: unknown) {
  act(() => {
    listeners.get(name)?.forEach((h) => h({ payload }));
  });
}

import { ListeningSetup } from "./ListeningSetup";
import { DEFAULT_CONFIG } from "../../services/tauriApi";
import type { AppConfig } from "../../types/config";

type Handler = (args: Record<string, unknown>) => unknown;

function backend(handlers: Record<string, Handler>) {
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
const cfg = (patch: Partial<AppConfig>): AppConfig => ({ ...DEFAULT_CONFIG, ...patch });

const MODELS = [
  { name: "tiny.en", url: "", size: "75 MB", downloaded: false, path: "" },
  { name: "base.en", url: "", size: "142 MB", downloaded: true, path: "C:\\models\\ggml-base.en.bin" },
];

beforeEach(() => {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  invoke.mockReset();
  unlisten.mockReset();
  listeners.clear();
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe("ListeningSetup", () => {
  it("offers the five ways to transcribe and saves a new choice", async () => {
    backend({ get_key_status: () => ({}), get_available_whisper_models: () => MODELS });
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<ListeningSetup config={cfg({ stt_provider: "local_whisper" })} onChange={onChange} />);

    expect(await screen.findAllByRole("radio", { name: /^(On this computer|Groq|Deepgram|OpenAI|OpenRouter)/ })).toHaveLength(5);
    expect(screen.getByRole("radio", { name: /^On this computer/ })).toBeChecked();
    await userEvent.setup().click(screen.getByRole("radio", { name: /^Deepgram/ }));

    expect(onChange).toHaveBeenCalledWith({ stt_provider: "deepgram" });
  });

  it("shows which local models are downloaded and switches to a downloaded one", async () => {
    backend({ get_key_status: () => ({}), get_available_whisper_models: () => MODELS });
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(
      <ListeningSetup config={cfg({ stt_provider: "local_whisper", whisper_model_size: "tiny.en" })} onChange={onChange} />
    );

    await userEvent.setup().click(await screen.findByRole("button", { name: "Use base.en" }));

    expect(onChange).toHaveBeenCalledWith({
      whisper_model_size: "base.en",
      whisper_model_path: "C:\\models\\ggml-base.en.bin",
    });
    expect(screen.queryByRole("button", { name: "Use tiny.en" })).not.toBeInTheDocument();
  });

  it("downloads once on a double click, shows real progress, then selects the model", async () => {
    let finish!: (path: string) => void;
    backend({
      get_key_status: () => ({}),
      get_available_whisper_models: () => MODELS,
      download_model: () => new Promise<string>((r) => (finish = r)),
    });
    const onChange = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ListeningSetup config={cfg({ stt_provider: "local_whisper" })} onChange={onChange} />);

    await user.dblClick(await screen.findByRole("button", { name: "Download tiny.en" }));
    expect(callsTo("download_model")).toHaveLength(1);
    expect(callsTo("download_model")[0][1]).toEqual({ modelName: "tiny.en" });

    emit("model-download-progress", { model: "base.en", progress: 99, downloaded: 1, total: 1 });
    expect(screen.queryByText(/99%/)).not.toBeInTheDocument();
    emit("model-download-progress", { model: "tiny.en", progress: 41.7, downloaded: 1, total: 2 });
    expect(await screen.findByText(/Downloading tiny\.en, 41%/)).toBeInTheDocument();

    await act(async () => finish("C:\\models\\ggml-tiny.en.bin"));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        whisper_model_size: "tiny.en",
        whisper_model_path: "C:\\models\\ggml-tiny.en.bin",
      })
    );
    expect(screen.queryByRole("button", { name: "Download tiny.en" })).not.toBeInTheDocument();
  });

  it("reports a failed download inline and lets it be tried again", async () => {
    backend({
      get_key_status: () => ({}),
      get_available_whisper_models: () => MODELS,
      download_model: () => {
        throw "Failed to download: connection reset";
      },
    });
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<ListeningSetup config={cfg({ stt_provider: "local_whisper" })} onChange={onChange} />);

    await userEvent.setup().click(await screen.findByRole("button", { name: "Download tiny.en" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("connection reset");
    expect(screen.getByRole("button", { name: "Download tiny.en" })).toBeEnabled();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("says so when the model list cannot be read", async () => {
    backend({
      get_key_status: () => ({}),
      get_available_whisper_models: () => {
        throw "Failed to get app data dir";
      },
    });
    render(<ListeningSetup config={cfg({ stt_provider: "local_whisper" })} onChange={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to get app data dir");
  });

  it("asks for the right key for each online service", async () => {
    backend({ get_key_status: () => ({}), get_available_whisper_models: () => MODELS });
    const { rerender } = render(<ListeningSetup config={cfg({ stt_provider: "groq" })} onChange={vi.fn()} />);
    expect(await screen.findByLabelText("Groq API key")).toBeInTheDocument();

    rerender(<ListeningSetup config={cfg({ stt_provider: "deepgram" })} onChange={vi.fn()} />);
    expect(await screen.findByLabelText("Deepgram API key")).toBeInTheDocument();
    rerender(<ListeningSetup config={cfg({ stt_provider: "cloud_whisper" })} onChange={vi.fn()} />);
    expect(await screen.findByLabelText("OpenAI API key")).toBeInTheDocument();
    rerender(<ListeningSetup config={cfg({ stt_provider: "openrouter" })} onChange={vi.fn()} />);
    expect(await screen.findByLabelText("OpenRouter API key")).toBeInTheDocument();
    expect(screen.queryByLabelText("Groq API key")).not.toBeInTheDocument();
  });

  it("saves the Groq transcription model to its own setting", async () => {
    backend({ get_key_status: () => ({ groq: true }), get_available_whisper_models: () => MODELS });
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<ListeningSetup config={cfg({ stt_provider: "groq" })} onChange={onChange} />);

    await userEvent.setup().selectOptions(await screen.findByRole("combobox", { name: "Transcription model" }), "whisper-large-v3");

    expect(onChange).toHaveBeenCalledWith({ groq_whisper_model: "whisper-large-v3" });
  });

  it("keeps at least one spoken language and sets auto-detect only when several are chosen", async () => {
    backend({ get_key_status: () => ({}), get_available_whisper_models: () => MODELS });
    const onChange = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    const { rerender } = render(
      <ListeningSetup config={cfg({ stt_languages: ["en"], stt_language: "en" })} onChange={onChange} />
    );

    await user.click(await screen.findByRole("checkbox", { name: "English" }));
    expect(onChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("checkbox", { name: "Tagalog" }));
    expect(onChange).toHaveBeenLastCalledWith({ stt_languages: ["en", "tl"], stt_language: "auto" });

    rerender(<ListeningSetup config={cfg({ stt_languages: ["en", "tl"], stt_language: "auto" })} onChange={onChange} />);
    await user.click(screen.getByRole("checkbox", { name: "English" }));
    expect(onChange).toHaveBeenLastCalledWith({ stt_languages: ["tl"], stt_language: "tl" });
  });

  it("stops listening for progress when it is removed", async () => {
    backend({ get_key_status: () => ({}), get_available_whisper_models: () => MODELS });
    const { unmount } = render(<ListeningSetup config={cfg({ stt_provider: "local_whisper" })} onChange={vi.fn()} />);
    await screen.findByRole("button", { name: "Download tiny.en" });

    unmount();

    await waitFor(() => expect(unlisten).toHaveBeenCalledWith("model-download-progress"));
    expect(listeners.get("model-download-progress")?.size ?? 0).toBe(0);
  });
});
