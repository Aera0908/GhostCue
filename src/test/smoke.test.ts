import { describe, expect, it } from "vitest";
import { isTauri } from "../services/tauriApi";

describe("test harness", () => {
  it("runs outside the Tauri runtime", () => {
    expect(isTauri()).toBe(false);
  });

  it("detects the Tauri runtime when its internals are present", () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    try {
      expect(isTauri()).toBe(true);
    } finally {
      delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    }
  });
});
