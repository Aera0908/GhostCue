import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, TauriApi } from "./tauriApi";
import backendDefaults from "../../src-tauri/tests/fixtures/default_config.json";

describe("key storage outside the Tauri runtime", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("reports every key as missing before anything is saved", async () => {
    const status = await TauriApi.getKeyStatus();
    expect(Object.keys(status).sort()).toEqual(
      ["anthropic", "custom", "deepgram", "deepseek", "gemini", "groq", "openai", "openrouter"]
    );
    expect(Object.values(status).every((v) => v === false)).toBe(true);
  });

  it("keeps each key separate", async () => {
    await TauriApi.setProviderKey("deepseek", "sk-deepseek");
    const status = await TauriApi.getKeyStatus();
    expect(status.deepseek).toBe(true);
    expect(status.custom).toBe(false);
    expect(status.openrouter).toBe(false);
    await TauriApi.clearProviderKey("deepseek");
    expect((await TauriApi.getKeyStatus()).deepseek).toBe(false);
  });

  it("never writes a key to browser storage", async () => {
    await TauriApi.setProviderKey("openai", "sk-NEVER-IN-STORAGE");
    const dump = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    expect(dump).not.toContain("sk-NEVER-IN-STORAGE");
    await TauriApi.clearProviderKey("openai");
  });

  it("rejects an empty or whitespace-only key", async () => {
    await expect(TauriApi.setProviderKey("groq", "  \n")).rejects.toBeTruthy();
    expect((await TauriApi.getKeyStatus()).groq).toBe(false);
  });
});

describe("settings without keys", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("has no key fields in the default config", () => {
    expect(Object.keys(DEFAULT_CONFIG).filter((k) => k.endsWith("_api_key"))).toEqual([]);
  });

  it("has exactly the backend's defaults", () => {
    expect(DEFAULT_CONFIG).toEqual(backendDefaults);
  });

  it("drops key fields left in browser storage by an older version", async () => {
    localStorage.setItem(
      "ghostcue_config",
      JSON.stringify({ target_role: "Kept", openai_api_key: "sk-OLD-IN-STORAGE", custom_api_key: "c-OLD" })
    );

    const config = await TauriApi.getConfig();

    expect(config.target_role).toBe("Kept");
    expect(JSON.stringify(config)).not.toContain("OLD");
    expect(config.groq_model).toBe(DEFAULT_CONFIG.groq_model);
    expect(config.config_version).toBe(2);
  });

  it("never writes a key field to browser storage, whatever it is handed", async () => {
    const sneaky = { ...DEFAULT_CONFIG, anthropic_api_key: "sk-ant-SNEAKY" } as typeof DEFAULT_CONFIG;

    const saved = await TauriApi.saveConfig(sneaky);

    expect(localStorage.getItem("ghostcue_config")).not.toContain("SNEAKY");
    expect(JSON.stringify(saved)).not.toContain("SNEAKY");
  });

  it("survives corrupt browser storage", async () => {
    for (const bad of ["{", "null", "[]", "42", '"text"']) {
      localStorage.setItem("ghostcue_config", bad);
      expect(await TauriApi.getConfig()).toEqual(DEFAULT_CONFIG);
    }
  });
});
