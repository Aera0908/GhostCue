import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

import { ProviderSetup } from "./ProviderSetup";
import { PROVIDERS } from "./providers";
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

/** A promise the test resolves by hand, to control the order responses arrive in. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const cfg = (patch: Partial<AppConfig>): AppConfig => ({ ...DEFAULT_CONFIG, ...patch });
const ok = { ok: true, kind: null, message: "Groq answered using llama-test.", model: "llama-test", latency_ms: 420 };

beforeEach(() => {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  invoke.mockReset();
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe("ProviderSetup", () => {
  it("lists every provider once, with the selected one checked", async () => {
    backend({ get_key_status: () => ({ groq: true }), list_provider_models: () => [] });
    render(<ProviderSetup config={cfg({ llm_provider: "groq" })} onChange={vi.fn()} />);

    const radios = await screen.findAllByRole("radio");
    expect(radios).toHaveLength(PROVIDERS.length);
    expect(PROVIDERS.map((p) => p.slug).sort()).toEqual(
      ["anthropic", "custom", "deepseek", "gemini", "groq", "ollama", "openai", "openrouter"]
    );
    expect(screen.getByRole("radio", { name: /^Groq/ })).toBeChecked();
    expect(radios.filter((r) => (r as HTMLInputElement).checked)).toHaveLength(1);
  });

  it("selects nothing when the saved provider is unknown", async () => {
    backend({ get_key_status: () => ({}) });
    render(<ProviderSetup config={cfg({ llm_provider: "something-removed" })} onChange={vi.fn()} />);

    const radios = await screen.findAllByRole("radio");
    expect(radios.some((r) => (r as HTMLInputElement).checked)).toBe(false);
    expect(screen.queryByRole("button", { name: "Test" })).not.toBeInTheDocument();
  });

  it("saves the choice when another provider is picked", async () => {
    backend({ get_key_status: () => ({}) });
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<ProviderSetup config={cfg({ llm_provider: "groq" })} onChange={onChange} />);

    await userEvent.setup().click(await screen.findByRole("radio", { name: /^Anthropic/ }));

    expect(onChange).toHaveBeenCalledWith({ llm_provider: "anthropic" });
  });

  it("asks for a key first and does not list models or allow a test without one", async () => {
    backend({ get_key_status: () => ({ groq: false }) });
    render(<ProviderSetup config={cfg({ llm_provider: "groq" })} onChange={vi.fn()} />);

    expect(await screen.findByLabelText("Groq API key")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test" })).toBeDisabled();
    expect(callsTo("list_provider_models")).toHaveLength(0);
    expect(callsTo("test_llm_provider")).toHaveLength(0);
  });

  it("loads the model list once a key is saved and saves the picked model", async () => {
    let saved = false;
    backend({
      get_key_status: () => ({ groq: saved }),
      set_provider_key: () => {
        saved = true;
      },
      list_provider_models: () => [
        { id: "llama-a", vision: null },
        { id: "llama-b", vision: null },
      ],
    });
    const onChange = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ProviderSetup config={cfg({ llm_provider: "groq", groq_model: "llama-a" })} onChange={onChange} />);

    await user.type(await screen.findByLabelText("Groq API key"), "gsk_abc");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const model = await screen.findByRole("combobox", { name: "Model" });
    expect(callsTo("list_provider_models")[0][1]).toEqual({ provider: "groq" });
    await user.selectOptions(model, "llama-b");
    expect(onChange).toHaveBeenCalledWith({ groq_model: "llama-b" });
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ openai_model: expect.anything() }));
  });

  it("keeps a saved model that the provider no longer lists", async () => {
    backend({ get_key_status: () => ({ groq: true }), list_provider_models: () => [{ id: "llama-a", vision: null }] });
    render(<ProviderSetup config={cfg({ llm_provider: "groq", groq_model: "retired-model" })} onChange={vi.fn()} />);

    const model = await screen.findByRole("combobox", { name: "Model" });
    expect(model).toHaveValue("retired-model");
    expect(within(model).getAllByRole("option").map((o) => (o as HTMLOptionElement).value)).toEqual(
      ["retired-model", "llama-a"]
    );
  });

  it("list_failure_allows_manual_model", async () => {
    backend({
      get_key_status: () => ({ groq: true }),
      list_provider_models: () => {
        throw "Groq could not be reached. Check the address and your connection.";
      },
    });
    const onChange = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ProviderSetup config={cfg({ llm_provider: "groq", groq_model: "" })} onChange={onChange} />);

    expect(await screen.findByText(/Groq could not be reached/)).toBeInTheDocument();
    const input = screen.getByRole("textbox", { name: "Model" });
    await user.type(input, "  my-model  ");
    await user.tab();

    expect(onChange).toHaveBeenCalledWith({ groq_model: "my-model" });
  });

  it("lets a model name be typed even when a list is available, and switches back", async () => {
    backend({ get_key_status: () => ({ groq: true }), list_provider_models: () => [{ id: "llama-a", vision: null }] });
    const user = userEvent.setup();
    render(<ProviderSetup config={cfg({ llm_provider: "groq", groq_model: "llama-a" })} onChange={vi.fn()} />);

    await screen.findByRole("combobox", { name: "Model" });
    await user.click(screen.getByRole("button", { name: "Type a name instead" }));
    expect(screen.getByRole("textbox", { name: "Model" })).toHaveValue("llama-a");
    await user.click(screen.getByRole("button", { name: "Choose from the list" }));
    expect(screen.getByRole("combobox", { name: "Model" })).toBeInTheDocument();
  });

  it("sends one test when Test is double-clicked and shows the provider's answer", async () => {
    const pending = deferred<typeof ok>();
    backend({
      get_key_status: () => ({ groq: true }),
      list_provider_models: () => [{ id: "llama-test", vision: null }],
      test_llm_provider: () => pending.promise,
    });
    const user = userEvent.setup();
    render(<ProviderSetup config={cfg({ llm_provider: "groq", groq_model: "llama-test" })} onChange={vi.fn()} />);

    await screen.findByRole("combobox", { name: "Model" });
    await user.dblClick(screen.getByRole("button", { name: "Test" }));

    expect(callsTo("test_llm_provider")).toHaveLength(1);
    expect(callsTo("test_llm_provider")[0][1]).toEqual({ provider: "groq" });
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for Groq to answer.");
    pending.resolve(ok);
    const answer = await screen.findByText(/Groq answered using llama-test\./);
    expect(answer).toHaveAttribute("role", "status");
    expect(answer).toHaveTextContent("0.4 s");
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("shows a failed test as a problem, in the provider's words", async () => {
    backend({
      get_key_status: () => ({ groq: true }),
      list_provider_models: () => [],
      test_llm_provider: () => ({
        ok: false,
        kind: "bad_key",
        message: "Groq rejected the API key. Check the key and try again.",
        model: "llama-test",
        latency_ms: 90,
      }),
    });
    const user = userEvent.setup();
    render(<ProviderSetup config={cfg({ llm_provider: "groq", groq_model: "llama-test" })} onChange={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Test" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Groq rejected the API key.");
    expect(screen.getByRole("button", { name: "Test" })).toBeEnabled();
  });

  it("shows a test that could not even be started", async () => {
    backend({
      get_key_status: () => ({ groq: true }),
      list_provider_models: () => [],
      test_llm_provider: () => {
        throw new Error("ipc channel closed");
      },
    });
    render(<ProviderSetup config={cfg({ llm_provider: "groq", groq_model: "m" })} onChange={vi.fn()} />);

    await userEvent.setup().click(await screen.findByRole("button", { name: "Test" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("ipc channel closed");
  });

  it("stale_results_are_discarded", async () => {
    const slowList = deferred<{ id: string; vision: null }[]>();
    const slowTest = deferred<typeof ok>();
    backend({
      get_key_status: () => ({ groq: true, deepseek: true }),
      list_provider_models: (args) =>
        args.provider === "groq" ? slowList.promise : [{ id: "deepseek-only", vision: null }],
      test_llm_provider: (args) =>
        args.provider === "groq"
          ? slowTest.promise
          : { ...ok, message: "DeepSeek answered using deepseek-only.", model: "deepseek-only" },
    });
    const user = userEvent.setup();
    const { rerender } = render(
      <ProviderSetup config={cfg({ llm_provider: "groq", groq_model: "llama-test" })} onChange={vi.fn()} />
    );
    await user.click(await screen.findByRole("button", { name: "Test" }));

    rerender(<ProviderSetup config={cfg({ llm_provider: "deepseek", deepseek_model: "deepseek-only" })} onChange={vi.fn()} />);
    const model = await screen.findByRole("combobox", { name: "Model" });
    slowList.resolve([{ id: "groq-only", vision: null }]);
    slowTest.resolve(ok);
    await new Promise((r) => setTimeout(r, 20));

    expect(within(model).queryByRole("option", { name: "groq-only" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Groq answered/)).not.toBeInTheDocument();
    expect(model).toHaveValue("deepseek-only");
  });

  it("saves what was typed before it tests, so the test uses the same settings", async () => {
    const order: string[] = [];
    backend({
      get_key_status: () => ({}),
      list_provider_models: () => {
        throw "Custom endpoint could not be reached.";
      },
      test_llm_provider: () => {
        order.push("test");
        return { ...ok, message: "Custom endpoint answered using local.", model: "local" };
      },
    });
    const onChange = vi.fn(async (patch: Partial<AppConfig>) => {
      order.push(`save:${Object.keys(patch).join(",")}`);
    });
    const user = userEvent.setup();
    render(
      <ProviderSetup
        config={cfg({ llm_provider: "custom", custom_endpoint: "http://localhost:1234/v1", custom_model: "" })}
        onChange={onChange}
      />
    );

    await user.type(await screen.findByRole("textbox", { name: "Model" }), "local");
    await user.click(screen.getByRole("button", { name: "Test" }));

    await screen.findByRole("status");
    expect(order).toEqual(["save:custom_model", "test"]);
  });

  it("does not test when saving the typed value failed", async () => {
    backend({
      get_key_status: () => ({}),
      list_provider_models: () => {
        throw "unreachable";
      },
      test_llm_provider: () => ok,
    });
    const onChange = vi.fn().mockRejectedValue("Settings could not be saved: disk full");
    const user = userEvent.setup();
    render(
      <ProviderSetup
        config={cfg({ llm_provider: "custom", custom_endpoint: "http://localhost:1234/v1", custom_model: "" })}
        onChange={onChange}
      />
    );

    await user.type(await screen.findByRole("textbox", { name: "Model" }), "local");
    await user.click(screen.getByRole("button", { name: "Test" }));

    expect(await screen.findByText(/disk full/)).toBeInTheDocument();
    expect(callsTo("test_llm_provider")).toHaveLength(0);
  });

  it("offers Ollama with an address and no key, and reloads models when the address changes", async () => {
    backend({ get_key_status: () => ({}), list_provider_models: () => [{ id: "qwen:7b", vision: null }] });
    const onChange = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ProviderSetup config={cfg({ llm_provider: "ollama", ollama_model: "" })} onChange={onChange} />);

    await screen.findByRole("combobox", { name: "Model" });
    expect(screen.queryByLabelText(/API key/)).not.toBeInTheDocument();
    const address = screen.getByRole("textbox", { name: "Server address" });
    await user.clear(address);
    await user.type(address, "http://192.168.1.5:11434{Enter}");

    expect(onChange).toHaveBeenCalledWith({ ollama_endpoint: "http://192.168.1.5:11434" });
    await waitFor(() => expect(callsTo("list_provider_models")).toHaveLength(2));
  });

  it("says what to do when Ollama has no models", async () => {
    backend({ get_key_status: () => ({}), list_provider_models: () => [] });
    render(<ProviderSetup config={cfg({ llm_provider: "ollama", ollama_model: "" })} onChange={vi.fn()} />);

    expect(await screen.findByText(/ollama pull/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test" })).toBeDisabled();
  });

  it("does not touch state after it is removed mid-request", async () => {
    const pending = deferred<never[]>();
    backend({ get_key_status: () => ({ groq: true }), list_provider_models: () => pending.promise });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(<ProviderSetup config={cfg({ llm_provider: "groq" })} onChange={vi.fn()} />);
    await waitFor(() => expect(callsTo("list_provider_models")).toHaveLength(1));

    unmount();
    pending.resolve([]);
    await new Promise((r) => setTimeout(r, 0));

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("never asks the backend for a stored key", async () => {
    backend({ get_key_status: () => ({ groq: true }), list_provider_models: () => [] });
    render(<ProviderSetup config={cfg({ llm_provider: "groq" })} onChange={vi.fn()} />);
    await screen.findByText("Saved");

    const commands = new Set(invoke.mock.calls.map((c) => c[0]));
    expect([...commands].sort()).toEqual(["get_key_status", "list_provider_models"]);
  });
});
