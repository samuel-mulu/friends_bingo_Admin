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
  getOperationModeLockReason,
  getOperationModeHint,
  isOperationModeLockedAfterRegistration,
  readStoredDefaultOperationMode,
  shouldPromptApplyModeToCurrentGame,
  writeStoredDefaultOperationMode,
  validateBigGameScheduleOrder,
  isoToDatetimeLocal,
  datetimeLocalToIso,
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
    category: "NORMAL",
    isBonus: false,
    fixedPrizeAmount: null,
    maxCartelasPerPlayer: null,
    entryFee: "10",
    prizePerCartela: "8",
    prizeAmount: "8",
    registeredCartelasCount: 1,
    calledNumbersCount: 0,
    sortOrder: 1,
    operationMode: "MANUAL",
    registrationDurationSeconds: null,
    autoCallIntervalSeconds: null,
    scheduledStartAt: null,
    canStart: true,
    canRegister: true,
    canCallNumber: false,
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
    expect(getOperationModeHint("MANUAL")).toBe("");
  });

  it("defaults create form to Automatic with 60s and 7s", () => {
    expect(getCreateFormDefaults("AUTO")).toEqual({
      operationMode: "AUTO",
      registrationDurationSeconds: FALLBACK_REGISTRATION_DURATION_SECONDS,
      autoCallIntervalSeconds: FALLBACK_AUTO_CALL_INTERVAL_SECONDS,
    });
    expect(getOperationModeHint("AUTO")).toBe("");
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
    const currentGame = createOperationGame({ registeredCartelasCount: 0 });

    expect(shouldPromptApplyModeToCurrentGame(currentGame, "AUTO")).toBe(true);
    expect(getApplyOperationModePrompt("AUTO")).toBe(
      "Switch this game to Automatic?",
    );
  });

  it("does not prompt when current game already matches header mode", () => {
    const currentGame = createOperationGame({ operationMode: "AUTO" });

    expect(shouldPromptApplyModeToCurrentGame(currentGame, "AUTO")).toBe(false);
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

  it("builds create-game request body for Bonus with fixed prize fields", () => {
    expect(
      buildCreateGameRequestBody({
        gameRuleId: "rule-1",
        category: "BONUS",
        fixedPrizeAmount: "5000",
        maxCartelasPerPlayer: 5,
        operationMode: "MANUAL",
      }),
    ).toEqual({
      gameRuleId: "rule-1",
      category: "BONUS",
      fixedPrizeAmount: "5000",
      maxCartelasPerPlayer: 5,
      operationMode: "MANUAL",
    });
  });

  it("builds create-game request body for Big Game schedule fields", () => {
    expect(
      buildCreateGameRequestBody({
        gameRuleId: "rule-1",
        category: "BIG_GAME",
        entryFee: "25",
        fixedPrizeAmount: "10000",
        maxCartelasPerPlayer: 20,
        registrationOpensAt: "2026-07-01T09:00:00.000Z",
        playStartAt: "2026-07-01T12:00:00.000Z",
      }),
    ).toEqual({
      gameRuleId: "rule-1",
      category: "BIG_GAME",
      entryFee: "25",
      fixedPrizeAmount: "10000",
      maxCartelasPerPlayer: 20,
      registrationOpensAt: "2026-07-01T09:00:00.000Z",
      playStartAt: "2026-07-01T12:00:00.000Z",
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
          registeredCartelasCount: 0,
          scheduledStartAt: null,
        }),
      ),
    ).toBe("Automatic registration is being prepared...");

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
          autoCallEnabled: true,
          autoCallIntervalMs: 7000,
          calledNumbersCount: 3,
        }),
        { secondsUntilNextBall: 0 },
      ),
    ).toBe("Auto-call every 7s · calling next ball…");

    expect(
      getGameOperationStatusHint(
        createOperationGame({
          operationMode: "AUTO",
          playerStatus: "playing",
          operationStatus: "live",
          calledNumbersCount: 0,
        }),
        { secondsUntilNextBall: 0 },
      ),
    ).toBe("Waiting for first ball · calling now…");

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
      getGameOperationStatusHint(
        createOperationGame({ operationMode: "MANUAL" }),
      ),
    ).toBe("Admin controls this game");

    expect(
      getGameOperationStatusHint(
        createOperationGame({
          rawStatus: "NO_WINNER",
          playerStatus: "finished",
        }),
      ),
    ).toBe(
      "No winner · all 75 numbers called · queue restored / next game pending",
    );

    expect(
      getGameOperationStatusHint(
        createOperationGame({
          operationMode: "AUTO",
          scheduledStartAt: "2026-06-10T12:01:00.000Z",
        }),
        {
          secondsUntilRegistrationClose: 18,
          isSameSlotAsCurrentGame: true,
        },
      ),
    ).toBe("Registration open · closes in 18s");
  });

  it("locks operation mode after READY registration has players", () => {
    const currentGame = createOperationGame({
      rawStatus: "READY",
      registeredCartelasCount: 1,
      operationMode: "AUTO",
    });

    expect(isOperationModeLockedAfterRegistration(currentGame)).toBe(true);
    expect(getOperationModeLockReason(currentGame)).toBe(
      "Mode locked after players register.",
    );
    expect(shouldPromptApplyModeToCurrentGame(currentGame, "MANUAL")).toBe(
      false,
    );
  });

  it("allows operation mode prompt for READY registration before players register", () => {
    const currentGame = createOperationGame({
      rawStatus: "READY",
      registeredCartelasCount: 0,
      operationMode: "AUTO",
    });

    expect(isOperationModeLockedAfterRegistration(currentGame)).toBe(false);
    expect(shouldPromptApplyModeToCurrentGame(currentGame, "MANUAL")).toBe(
      true,
    );
  });
});

describe("big game schedule helpers", () => {
  it("converts ISO datetime to datetime-local input value", () => {
    expect(isoToDatetimeLocal("2026-06-26T08:00:00.000Z")).toMatch(
      /^2026-06-26T\d{2}:\d{2}$/,
    );
  });

  it("rejects schedule order when registration opens after play start", () => {
    expect(
      validateBigGameScheduleOrder(
        "2026-06-27T22:00:00.000Z",
        "2026-06-27T08:00:00.000Z",
      ),
    ).toBe("Registration must open before play starts.");
  });

  it("accepts valid schedule order", () => {
    expect(
      validateBigGameScheduleOrder(
        "2026-06-27T08:00:00.000Z",
        "2026-06-27T22:00:00.000Z",
      ),
    ).toBeNull();
  });

  it("round-trips datetime-local through ISO conversion", () => {
    const iso = datetimeLocalToIso("2026-06-27T10:30");
    expect(iso).not.toBeNull();
    expect(isoToDatetimeLocal(iso)).toBe("2026-06-27T10:30");
  });
});
