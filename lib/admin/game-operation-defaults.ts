import type { UpdateSlotOperationModePayload } from "@/lib/api/admin";
import type {
  CreateGamePayload,
  GameOperationMode,
  GameTimingConfig,
} from "@/lib/api/types";
import type { GameOperationItem } from "@/lib/api/admin";

export const DEFAULT_OPERATION_MODE_STORAGE_KEY =
  "friends-bingo-admin.default-operation-mode";

/** Used only when Time Config has not loaded yet. */
export const FALLBACK_REGISTRATION_DURATION_SECONDS = "60";
export const FALLBACK_AUTO_CALL_INTERVAL_SECONDS = "7";
export const FALLBACK_AUTO_CALL_INTERVAL_MS = 7000;

export type CreateGameFormDefaults = {
  operationMode: GameOperationMode;
  registrationDurationSeconds: string;
  autoCallIntervalSeconds: string;
};

export type TimingConfigLike = Pick<
  GameTimingConfig,
  "registrationDurationSeconds" | "autoCallIntervalSeconds"
> | null | undefined;

export function resolveAutoCallIntervalMs(
  game: Pick<GameOperationItem, "autoCallIntervalMs">,
  timing?: TimingConfigLike,
): number {
  if (game.autoCallIntervalMs != null) {
    return game.autoCallIntervalMs;
  }

  return (timing?.autoCallIntervalSeconds ?? Number(FALLBACK_AUTO_CALL_INTERVAL_SECONDS)) *
    1000;
}

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

export function buildCreateGameRequestBody(payload: CreateGamePayload) {
  const body: CreateGamePayload = {
    gameRuleId: payload.gameRuleId,
  };

  if (payload.operationMode) {
    body.operationMode = payload.operationMode;
  }

  if (payload.registrationDurationSeconds != null) {
    body.registrationDurationSeconds = payload.registrationDurationSeconds;
  }

  if (payload.autoCallIntervalSeconds != null) {
    body.autoCallIntervalSeconds = payload.autoCallIntervalSeconds;
  }

  return body;
}

export function getCreateFormDefaults(
  mode: GameOperationMode,
  timing?: TimingConfigLike,
): CreateGameFormDefaults {
  const registrationDurationSeconds = String(
    timing?.registrationDurationSeconds ??
      Number(FALLBACK_REGISTRATION_DURATION_SECONDS),
  );
  const autoCallIntervalSeconds = String(
    timing?.autoCallIntervalSeconds ??
      Number(FALLBACK_AUTO_CALL_INTERVAL_SECONDS),
  );

  return {
    operationMode: mode,
    registrationDurationSeconds,
    autoCallIntervalSeconds,
  };
}

export function getOperationModeHint(mode: GameOperationMode): string {
  return mode === "MANUAL"
    ? "Admin starts games"
    : "Registration countdown, auto-start, auto-call";
}

const blockedOperationModeSwitchStatuses = new Set([
  "winnerWindow",
  "finished",
  "cancelled",
  "checking",
]);

/** Current live/checking game takes priority over next registration. */
export function getFocusedGameForModeSwitch(operations: {
  liveGame: GameOperationItem | null;
  checkingGame: GameOperationItem | null;
  registrationOpenGame: GameOperationItem | null;
}): GameOperationItem | null {
  return (
    operations.liveGame ??
    operations.checkingGame ??
    operations.registrationOpenGame
  );
}

/** @deprecated Use getFocusedGameForModeSwitch */
export function getCurrentGameForModeSwitch(operations: {
  liveGame: GameOperationItem | null;
  registrationOpenGame: GameOperationItem | null;
}): GameOperationItem | null {
  return getFocusedGameForModeSwitch({
    ...operations,
    checkingGame: null,
  });
}

export type GameOperationStatusHintContext = {
  secondsUntilNextBall?: number | null;
  secondsUntilRegistrationClose?: number | null;
  secondsUntilWinnerWindowEnd?: number | null;
  isSameSlotAsCurrentGame?: boolean;
};

export function getGameOperationStatusHint(
  game: GameOperationItem,
  context: GameOperationStatusHintContext = {},
  timing?: TimingConfigLike,
): string {
  if (game.operationMode === "MANUAL") {
    if (game.playerStatus === "checking") {
      return "Checking claim";
    }

    if (game.playerStatus === "finished") {
      return "Finalizing results";
    }

    return "Admin controls this game";
  }

  const autoCallIntervalSec = Math.round(
    resolveAutoCallIntervalMs(game, timing) / 1000,
  );

  if (game.playerStatus === "finished") {
    return "Finalizing results";
  }

  if (game.playerStatus === "checking") {
    return "Checking claim";
  }

  if (game.playerStatus === "winnerWindow") {
    if (context.secondsUntilWinnerWindowEnd != null) {
      return `Winner window · ${context.secondsUntilWinnerWindowEnd}s remaining · other players can still claim`;
    }

    return "Winner window · other players can still claim";
  }

  if (game.playerStatus === "playing") {
    if ((game.calledNumbersCount ?? 0) === 0) {
      if (context.secondsUntilNextBall != null) {
        return `Waiting for first ball · ${context.secondsUntilNextBall}s`;
      }

      return "Waiting for first ball";
    }

    if (context.secondsUntilNextBall != null) {
      return `Auto-call every ${autoCallIntervalSec}s · next in ${context.secondsUntilNextBall}s`;
    }

    if (game.autoCallEnabled) {
      return `Auto-call every ${autoCallIntervalSec}s`;
    }

    return "Automatic — auto-call starts when switched to Auto";
  }

  if (
    game.playerStatus === "registrationOpen" ||
    game.rawStatus === "READY" ||
    game.rawStatus === "NEXT"
  ) {
    if (context.isSameSlotAsCurrentGame) {
      return "Registration closed · preparing game…";
    }

    if (context.secondsUntilRegistrationClose != null) {
      if (context.secondsUntilRegistrationClose > 0) {
        return `Registration open · closes in ${context.secondsUntilRegistrationClose}s`;
      }

      return "Registration closed · preparing game…";
    }

    return game.scheduledStartAt
      ? "Registration countdown running"
      : "Automatic — countdown starts when switched to Auto";
  }

  return getOperationModeHint("AUTO");
}

export function getFocusedOperationModeHint(
  focusedGame: GameOperationItem | null,
  defaultMode: GameOperationMode,
  timing?: TimingConfigLike,
): string {
  if (focusedGame) {
    return getGameOperationStatusHint(focusedGame, {}, timing);
  }

  return defaultMode === "MANUAL"
    ? "Default for new games — admin starts games"
    : "Default for new games — countdown, auto-start, auto-call";
}

export function shouldPromptApplyModeToCurrentGame(
  currentGame: GameOperationItem | null,
  newMode: GameOperationMode,
): currentGame is GameOperationItem {
  if (!currentGame) {
    return false;
  }

  if (currentGame.operationMode === newMode) {
    return false;
  }

  return !blockedOperationModeSwitchStatuses.has(currentGame.playerStatus);
}

export function buildOperationModeSwitchPayload(
  game: GameOperationItem,
  mode: GameOperationMode,
  timing?: TimingConfigLike,
): UpdateSlotOperationModePayload {
  if (mode === "MANUAL") {
    return { operationMode: "MANUAL" };
  }

  const defaults = getCreateFormDefaults("AUTO", timing);

  return {
    operationMode: "AUTO",
    registrationDurationSeconds:
      game.registrationDurationSeconds ??
      Number(defaults.registrationDurationSeconds),
    autoCallIntervalSeconds:
      game.autoCallIntervalSeconds ??
      Number(defaults.autoCallIntervalSeconds),
  };
}

export function getApplyOperationModePrompt(mode: GameOperationMode): string {
  return mode === "AUTO"
    ? "Apply Automatic mode to current game?"
    : "Apply Manual mode to current game? Auto-call will stop if the game is live.";
}

export function getApplyOperationModeDescription(
  game: GameOperationItem,
  mode: GameOperationMode,
): string {
  const gameLabel = game.playCode ?? game.staticCode;

  if (mode === "AUTO") {
    return `${gameLabel} will use a registration countdown, auto-start, and auto-call. Registered cartelas and prizes stay unchanged.`;
  }

  return `${gameLabel} will return to manual admin control. Auto-call stops if the game is already live.`;
}
