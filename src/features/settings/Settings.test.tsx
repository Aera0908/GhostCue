import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: () => Promise.resolve(() => {}) }));

import { Settings } from "./Settings";
import { DEFAULT_CONFIG } from "../../services/tauriApi";
import type { AppConfig } from "../../types/config";

function backend() {
  const handlers: Record<string, () => unknown> = {
    get_key_status: () => ({ groq: true }),
    list_provider_models: () => [{ id: "llama-test", vision: null }],
    get_available_whisper_models: () => [],
    get_audio_devices: () => ({ inputs: [], outputs: [] }),
    start_audio_capture: () => true,
    stop_audio_capture: () => true,
  };
  invoke.mockImplementation((cmd: string) => {
    const handler = handlers[cmd];
    return handler ? Promise.resolve(handler()) : Promise.reject(new Error(`unexpected command ${cmd}`));
  });
}

const callsTo = (cmd: string) => invoke.mock.calls.filter((c) => c[0] === cmd);
const base: AppConfig = { ...DEFAULT_CONFIG, llm_provider: "groq", groq_model: "llama-test" };

function setup(patch: Partial<React.ComponentProps<typeof Settings>> = {}) {
  const props = {
    config: base,
    onChange: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    onRunSetup: vi.fn(),
    inLiveHud: false,
    ...patch,
  };
  const view = render(<Settings {...props} />);
  return { props, ...view };
}

beforeEach(() => {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  invoke.mockReset();
  backend();
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe("Settings", () => {
  it("shows one section at a time, starting where it was asked to", async () => {
    setup({ initialSection: "window" });

    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(within(nav).getAllByRole("button").map((b) => b.textContent)).toEqual(
      ["Answers", "Listening", "Sound", "Automatic answers", "Window and privacy", "Language", "Shortcuts"]
    );
    expect(within(nav).getByRole("button", { name: "Window and privacy" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Window and privacy" })).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();

    await userEvent.setup().click(within(nav).getByRole("button", { name: "Answers" }));
    expect(await screen.findByRole("radio", { name: /^Groq/ })).toBeChecked();
    expect(screen.queryByRole("switch", { name: "Hide from screen capture" })).not.toBeInTheDocument();
  });

  it("has no Save or Cancel: a switch is saved the moment it is flipped", async () => {
    const { props } = setup({ initialSection: "window" });

    expect(screen.queryByRole("button", { name: /^(Save|Cancel)/ })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("switch", { name: "Hide from screen capture" }));

    expect(props.onChange).toHaveBeenCalledTimes(1);
    expect(props.onChange).toHaveBeenCalledWith({ anti_capture_enabled: false });
  });

  it("shows a failed save and keeps showing the value that is really saved", async () => {
    const { props } = setup({
      initialSection: "window",
      onChange: vi.fn().mockRejectedValue("Settings could not be saved: disk full"),
    });

    await userEvent.setup().click(screen.getByRole("switch", { name: "Hide from screen capture" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("disk full");
    expect(screen.getByRole("switch", { name: "Hide from screen capture" })).toHaveAttribute("aria-checked", "true");
    expect(props.onChange).toHaveBeenCalledTimes(1);
  });

  it("saves a slider once when it is released, not on every step", () => {
    const { props } = setup({ initialSection: "window" });
    const slider = screen.getByRole("slider", { name: "Window opacity" });

    fireEvent.change(slider, { target: { value: "0.5" } });
    fireEvent.change(slider, { target: { value: "0.6" } });
    fireEvent.change(slider, { target: { value: "0.7" } });
    expect(props.onChange).not.toHaveBeenCalled();
    expect(screen.getByText("70%")).toBeInTheDocument();
    fireEvent.pointerUp(slider);
    fireEvent.blur(slider);

    expect(props.onChange).toHaveBeenCalledTimes(1);
    expect(props.onChange).toHaveBeenCalledWith({ opacity: 0.7 });
  });

  it("does not save a slider that ends where it started", () => {
    const { props } = setup({ initialSection: "window" });
    const slider = screen.getByRole("slider", { name: "Text size" });

    fireEvent.change(slider, { target: { value: "18" } });
    fireEvent.change(slider, { target: { value: "14" } });
    fireEvent.pointerUp(slider);

    expect(props.onChange).not.toHaveBeenCalled();
  });

  it("saves typed text when the field is left, and only if it changed", async () => {
    const { props } = setup({ initialSection: "answers" });
    const user = userEvent.setup();
    const field = await screen.findByLabelText("Extra instructions for every answer");

    await user.click(field);
    await user.tab();
    expect(props.onChange).not.toHaveBeenCalled();

    await user.type(field, "Keep answers under a minute.");
    expect(props.onChange).not.toHaveBeenCalled();
    await user.tab();
    expect(props.onChange).toHaveBeenCalledWith({ system_prompt_override: "Keep answers under a minute." });
  });

  it("turns on a separate code model only for the selected provider", async () => {
    const { props, rerender } = setup({ initialSection: "answers" });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("switch", { name: "Use a different model for code and screen questions" }));
    expect(props.onChange).toHaveBeenCalledWith({ smart_model_routing: true });

    rerender(<Settings {...props} config={{ ...base, smart_model_routing: true }} initialSection="answers" />);
    const field = await screen.findByLabelText("Model for code and screen questions");
    await user.type(field, "llama-code");
    await user.tab();
    expect(props.onChange).toHaveBeenLastCalledWith({ code_models: { groq: "llama-code" } });
  });

  it("resets settings only after an in-page confirmation, and says keys are kept", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { props } = setup({ initialSection: "window", config: { ...base, opacity: 0.4, target_role: "Mine" } });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Reset all settings" }));
    expect(props.onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/Saved API keys and your interviews are kept/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset" }));

    expect(props.onChange).toHaveBeenCalledTimes(1);
    expect(props.onChange).toHaveBeenCalledWith(DEFAULT_CONFIG);
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("does not take over the microphone while an interview is live", async () => {
    setup({ initialSection: "sound", inLiveHud: true });

    await screen.findByRole("meter", { name: "Microphone level" });
    await new Promise((r) => setTimeout(r, 20));
    expect(callsTo("start_audio_capture")).toHaveLength(0);
    expect(callsTo("stop_audio_capture")).toHaveLength(0);
  });

  it("closes with Done and offers setup again", async () => {
    const { props } = setup({ initialSection: "shortcuts" });
    const user = userEvent.setup();

    expect(screen.getByText("Ctrl + Shift + Space")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Run setup again" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(props.onRunSetup).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
