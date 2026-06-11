import { describe, expect, it } from "vitest";

import type { GameOperationItem } from "@/lib/api/admin";

import {
  buildCreateGameRequestBody,
  buildOperationModeSwitchPayload,
  FALLBACK_AUTO_CALL_INTERVAL_SECONDS,
  FALLBACK_REGISTRATION_DURATION_SECONDS,
  DEFAULT_OPERATION_MODE_STORAGE_KEY,
  getApplyOperationModePrompt,
  getCreateFormDefaults,
  getFocusedGameForModeSwitch,
  getGameOperationStatusHint,
  getOperationModeHint,
  readStoredDefaultOperationMode,
  shouldPromptApplyModeToCurrentGame,
  writeStoredDefaultOperationMode,
} from "./game-operation-defaults";

function createOperationGame(
  overrides: Partial<GameOperationItem> = {},
): GameOperationItem {
  return {
    slotId: "slot-1",
    sessionId: "session-1",
    staticCode: "MANUAL-S1",
    playCode: "BINGO-ABC123",
    rawStatus: "READY",
    playerStatus: "registrationOpen",
    operationStatus: "registration",
    gameRule: { id: "rule-1", name: "Manual", key: "MANUAL" },
    entryFee: "10",
    prizePerCartela: "8",
    prizeAmount: "8",
    registeredCartelasCount: 1,
    calledNumbersCount: 0,
    sortOrder: 1,
    winnerCartelaId: null,
    startedAt: null,
    finishedAt: null,
    operationMode: "MANUAL",
    registrationDurationSeconds: null,
    autoCallIntervalSeconds: null,
    scheduledStartAt: null,
    registrationOpen: true,
    canStart: true,
    canRegister: true,
    canCallNumber: false,
    canClaimBingo: false,
    ...overrides,
  };
}

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
      registrationDurationSeconds: FALLBACK_REGISTRATION_DURATION_SECONDS,
      autoCallIntervalSeconds: FALLBACK_AUTO_CALL_INTERVAL_SECONDS,
    });
    expect(getOperationModeHint("MANUAL")).toBe("Admin starts games");
  });

  it("defaults create form to Automatic with 60s and 7s", () => {
    expect(getCreateFormDefaults("AUTO")).toEqual({
      operationMode: "AUTO",
      registrationDurationSeconds: FALLBACK_REGISTRATION_DURATION_SECONDS,
      autoCallIntervalSeconds: FALLBACK_AUTO_CALL_INTERVAL_SECONDS,
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

  it("prompts to apply Automatic mode to the current registration game", () => {
    const currentGame = createOperationGame();

    expect(
      shouldPromptApplyModeToCurrentGame(currentGame, "AUTO"),
    ).toBe(true);
    expect(getApplyOperationModePrompt("AUTO")).toBe(
      "Apply Automatic mode to current game?",
    );
  });

  it("does not prompt when current game already matches header mode", () => {
    const currentGame = createOperationGame({ operationMode: "AUTO" });

    expect(
      shouldPromptApplyModeToCurrentGame(currentGame, "AUTO"),
    ).toBe(false);
  });

  it("uses saved timing defaults when pre-filling the create form", () => {
    expect(
      getCreateFormDefaults("AUTO", {
        registrationDurationSeconds: 45,
        autoCallIntervalSeconds: 9,
      }),
    ).toEqual({
      operationMode: "AUTO",
      registrationDurationSeconds: "45",
      autoCallIntervalSeconds: "9",
    });
  });

  it("builds operation mode switch payload from the focused game", () => {
    const currentGame = createOperationGame({
      registrationDurationSeconds: 45,
      autoCallIntervalSeconds: 9,
    });

    expect(buildOperationModeSwitchPayload(currentGame, "AUTO")).toEqual({
      operationMode: "AUTO",
      registrationDurationSeconds: 45,
      autoCallIntervalSeconds: 9,
    });
    expect(buildOperationModeSwitchPayload(currentGame, "MANUAL")).toEqual({
      operationMode: "MANUAL",
    });
  });

  it("builds create-game request body with operation mode fields", () => {
    expect(
      buildCreateGameRequestBody({
        gameRuleId: "rule-1",
        operationMode: "AUTO",
        registrationDurationSeconds: 60,
        autoCallIntervalSeconds: 7,
      }),
    ).toEqual({
      gameRuleId: "rule-1",
      operationMode: "AUTO",
      registrationDurationSeconds: 60,
      autoCallIntervalSeconds: 7,
    });
  });

  it("builds create-game request body for Manual without timing fields", () => {
    expect(
      buildCreateGameRequestBody({
        gameRuleId: "rule-1",
        operationMode: "MANUAL",
      }),
    ).toEqual({
      gameRuleId: "rule-1",
      operationMode: "MANUAL",
    });
  });

  it("prefers live game over registration for focused mode switch", () => {
    const registrationOpenGame = createOperationGame({
      slotId: "slot-registration",
    });
    const liveGame = createOperationGame({
      slotId: "slot-live",
      playerStatus: "playing",
      operationStatus: "live",
    });

    expect(
      getFocusedGameForModeSwitch({
        registrationOpenGame,
        liveGame,
        checkingGame: null,
      }),
    ).toEqual(liveGame);
  });

  it("describes AUTO READY and PLAYING status hints", () => {
    expect(
      getGameOperationStatusHint(
        createOperationGame({
          operationMode: "AUTO",
          scheduledStartAt: "2026-06-10T12:01:00.000Z",
        }),
      ),
    ).toContain("countdown");

    expect(
      getGameOperationStatusHint(
        createOperationGame({
          operationMode: "AUTO",
          playerStatus: "playing",
          operationStatus: "live",
          autoCallEnabled: true,
          autoCallIntervalMs: 7000,
          calledNumbersCount: 3,
        }),
        { secondsUntilNextBall: 4 },
      ),
    ).toBe("Auto-call every 7s · next in 4s");

    expect(
      getGameOperationStatusHint(
        createOperationGame({
          operationMode: "AUTO",
          playerStatus: "playing",
          operationStatus: "live",
          calledNumbersCount: 0,
        }),
        { secondsUntilNextBall: 5 },
      ),
    ).toBe("Waiting for first ball · 5s");

    expect(
      getGameOperationStatusHint(
        createOperationGame({
          operationMode: "AUTO",
          playerStatus: "winnerWindow",
          operationStatus: "live",
        }),
        { secondsUntilWinnerWindowEnd: 12 },
      ),
    ).toContain("Winner window");

    expect(
      getGameOperationStatusHint(
        createOperationGame({
          operationMode: "AUTO",
          scheduledStartAt: "2026-06-10T12:01:00.000Z",
        }),
        { secondsUntilRegistrationClose: 0 },
      ),
    ).toBe("Registration closed · preparing game…");

    expect(
      getGameOperationStatusHint(createOperationGame({ operationMode: "MANUAL" })),
    ).toBe("Admin controls this game");
  });
});
