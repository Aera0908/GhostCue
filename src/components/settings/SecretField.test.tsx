import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

import { SecretField } from "./SecretField";

type Handler = (args: Record<string, unknown>) => unknown;

function backend(handlers: Record<string, Handler>) {
  invoke.mockImplementation((cmd: string, args: Record<string, unknown>) => {
    const h = handlers[cmd];
    if (!h) return Promise.reject(new Error(`unexpected command ${cmd}`));
    try {
      return Promise.resolve(h(args ?? {}));
    } catch (e) {
      return Promise.reject(e);
    }
  });
}

function callsTo(cmd: string) {
  return invoke.mock.calls.filter((c) => c[0] === cmd);
}

beforeEach(() => {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  invoke.mockReset();
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe("SecretField", () => {
  it("shows the saved state without revealing or requesting the value", async () => {
    backend({ get_key_status: () => ({ groq: true }) });
    render(<SecretField keyId="groq" label="Groq API key" placeholder="gsk_..." />);

    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(screen.queryByLabelText("Groq API key")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Remove" })).toBeEnabled();
    expect(invoke.mock.calls.every((c) => c[0] === "get_key_status")).toBe(true);
  });

  it("saves once when Save is double-clicked", async () => {
    let release: () => void = () => {};
    backend({
      get_key_status: () => ({ groq: false }),
      set_provider_key: () => new Promise<void>((r) => (release = r)),
    });
    const user = userEvent.setup();
    render(<SecretField keyId="groq" label="Groq API key" placeholder="gsk_..." />);

    await user.type(await screen.findByLabelText("Groq API key"), "gsk_abc");
    await user.dblClick(screen.getByRole("button", { name: "Save" }));

    expect(callsTo("set_provider_key")).toHaveLength(1);
    expect(callsTo("set_provider_key")[0][1]).toEqual({ keyId: "groq", value: "gsk_abc" });
    release();
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("clears the typed value from the page after a successful save", async () => {
    backend({ get_key_status: () => ({ groq: false }), set_provider_key: () => undefined });
    const user = userEvent.setup();
    const { container } = render(<SecretField keyId="groq" label="Groq API key" placeholder="gsk_..." />);

    await user.type(await screen.findByLabelText("Groq API key"), "gsk_secret_value");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText("Saved");
    expect(container.innerHTML).not.toContain("gsk_secret_value");
    await user.click(screen.getByRole("button", { name: "Replace" }));
    expect(screen.getByLabelText("Groq API key")).toHaveValue("");
  });

  it("does not save an empty or whitespace-only value", async () => {
    backend({ get_key_status: () => ({ groq: false }), set_provider_key: () => undefined });
    const user = userEvent.setup();
    render(<SecretField keyId="groq" label="Groq API key" placeholder="gsk_..." />);

    const input = await screen.findByLabelText("Groq API key");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.type(input, "   ");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.type(input, "{Enter}");
    expect(callsTo("set_provider_key")).toHaveLength(0);
  });

  it("shows a failed save inline and keeps what was typed", async () => {
    backend({
      get_key_status: () => ({ groq: false }),
      set_provider_key: () => {
        throw "Windows Credential Manager is not available.";
      },
    });
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<SecretField keyId="groq" label="Groq API key" placeholder="gsk_..." />);

    const input = await screen.findByLabelText("Groq API key");
    await user.type(input, "gsk_abc");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Windows Credential Manager is not available.");
    expect(input).toHaveValue("gsk_abc");
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("removes the key and returns to the empty input", async () => {
    backend({ get_key_status: () => ({ groq: true }), clear_provider_key: () => undefined });
    const user = userEvent.setup();
    render(<SecretField keyId="groq" label="Groq API key" placeholder="gsk_..." />);

    await user.click(await screen.findByRole("button", { name: "Remove" }));

    await waitFor(() => expect(callsTo("clear_provider_key")).toHaveLength(1));
    expect(callsTo("clear_provider_key")[0][1]).toEqual({ keyId: "groq" });
    expect(await screen.findByLabelText("Groq API key")).toHaveValue("");
  });

  it("keeps the saved state when removal fails", async () => {
    backend({
      get_key_status: () => ({ groq: true }),
      clear_provider_key: () => {
        throw "Access denied.";
      },
    });
    const user = userEvent.setup();
    render(<SecretField keyId="groq" label="Groq API key" placeholder="gsk_..." />);

    await user.click(await screen.findByRole("button", { name: "Remove" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Access denied.");
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("does not update state after unmounting mid-save", async () => {
    let release: () => void = () => {};
    backend({
      get_key_status: () => ({ groq: false }),
      set_provider_key: () => new Promise<void>((r) => (release = r)),
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    const { unmount } = render(<SecretField keyId="groq" label="Groq API key" placeholder="gsk_..." />);

    await user.type(await screen.findByLabelText("Groq API key"), "gsk_abc");
    await user.click(screen.getByRole("button", { name: "Save" }));
    unmount();
    release();
    await new Promise((r) => setTimeout(r, 0));

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("passes a large pasted unicode value through unchanged", async () => {
    backend({ get_key_status: () => ({ custom: false }), set_provider_key: () => undefined });
    const user = userEvent.setup();
    render(<SecretField keyId="custom" label="API key" placeholder="" />);

    const value = "键🔑-é".repeat(2000);
    const input = await screen.findByLabelText("API key");
    await user.click(input);
    await user.paste(value);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText("Saved");
    expect(callsTo("set_provider_key")[0][1]).toEqual({ keyId: "custom", value });
  });

  it("shows the empty input when the status cannot be loaded", async () => {
    backend({
      get_key_status: () => {
        throw "store unavailable";
      },
    });
    render(<SecretField keyId="groq" label="Groq API key" placeholder="gsk_..." />);

    expect(await screen.findByRole("alert")).toHaveTextContent("store unavailable");
    expect(screen.getByLabelText("Groq API key")).toBeInTheDocument();
  });
});
