import type { GameOperationMode } from "@/lib/api/types";

export const DEFAULT_OPERATION_MODE_STORAGE_KEY =
  "friends-bingo-admin.default-operation-mode";

export const DEFAULT_REGISTRATION_DURATION_SECONDS = "60";
export const DEFAULT_AUTO_CALL_INTERVAL_SECONDS = "7";

export type CreateGameFormDefaults = {
  operationMode: GameOperationMode;
  registrationDurationSeconds: string;
  autoCallIntervalSeconds: string;
};

export function isGameOperationMode(value: string): value is GameOperationMode {
  return value === "MANUAL" || value === "AUTO";
}

export function readStoredDefaultOperationMode(
  storage: Pick<Storage, "getItem"> | null | undefined,
): GameOperationMode {
  if (!storage) {
    return "MANUAL";
  }

  const stored = storage.getItem(DEFAULT_OPERATION_MODE_STORAGE_KEY);
  return stored && isGameOperationMode(stored) ? stored : "MANUAL";
}

export function writeStoredDefaultOperationMode(
  storage: Pick<Storage, "setItem"> | null | undefined,
  mode: GameOperationMode,
): void {
  storage?.setItem(DEFAULT_OPERATION_MODE_STORAGE_KEY, mode);
}

export function getCreateFormDefaults(
  mode: GameOperationMode,
): CreateGameFormDefaults {
  if (mode === "AUTO") {
    return {
      operationMode: "AUTO",
      registrationDurationSeconds: DEFAULT_REGISTRATION_DURATION_SECONDS,
      autoCallIntervalSeconds: DEFAULT_AUTO_CALL_INTERVAL_SECONDS,
    };
  }

  return {
    operationMode: "MANUAL",
    registrationDurationSeconds: DEFAULT_REGISTRATION_DURATION_SECONDS,
    autoCallIntervalSeconds: DEFAULT_AUTO_CALL_INTERVAL_SECONDS,
  };
}

export function getOperationModeHint(mode: GameOperationMode): string {
  return mode === "MANUAL"
    ? "Admin starts games"
    : "Registration countdown, auto-start, auto-call";
}
