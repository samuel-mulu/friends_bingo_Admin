import { describe, expect, it } from "vitest";

import {
  DEFAULT_AUTO_CALL_INTERVAL_SECONDS,
  DEFAULT_OPERATION_MODE_STORAGE_KEY,
  DEFAULT_REGISTRATION_DURATION_SECONDS,
  getCreateFormDefaults,
  getOperationModeHint,
  readStoredDefaultOperationMode,
  writeStoredDefaultOperationMode,
} from "./game-operation-defaults";

function createMemoryStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

describe("game-operation-defaults", () => {
  it("defaults create form to Manual when header mode is Manual", () => {
    expect(getCreateFormDefaults("MANUAL")).toEqual({
      operationMode: "MANUAL",
      registrationDurationSeconds: DEFAULT_REGISTRATION_DURATION_SECONDS,
      autoCallIntervalSeconds: DEFAULT_AUTO_CALL_INTERVAL_SECONDS,
    });
    expect(getOperationModeHint("MANUAL")).toBe("Admin starts games");
  });

  it("defaults create form to Automatic with 60s and 7s", () => {
    expect(getCreateFormDefaults("AUTO")).toEqual({
      operationMode: "AUTO",
      registrationDurationSeconds: "60",
      autoCallIntervalSeconds: "7",
    });
    expect(getOperationModeHint("AUTO")).toBe(
      "Registration countdown, auto-start, auto-call",
    );
  });

  it("restores selected mode from storage after refresh", () => {
    const storage = createMemoryStorage({
      [DEFAULT_OPERATION_MODE_STORAGE_KEY]: "AUTO",
    });

    expect(readStoredDefaultOperationMode(storage)).toBe("AUTO");

    writeStoredDefaultOperationMode(storage, "MANUAL");

    expect(readStoredDefaultOperationMode(storage)).toBe("MANUAL");
  });

  it("falls back to Manual for invalid stored values", () => {
    const storage = createMemoryStorage({
      [DEFAULT_OPERATION_MODE_STORAGE_KEY]: "UNKNOWN",
    });

    expect(readStoredDefaultOperationMode(storage)).toBe("MANUAL");
  });
});
