import type { CalledNumber } from "@/lib/api/types";

import {
  isCalledNumberForActiveSession,
  normalizeCalledNumberPayload,
  parseAutoCallScheduleFromPayload,
} from "./game-operations-cache";

type AutoCallPatch = {
  sessionId?: string;
  slotId?: string;
  autoCallEnabled?: boolean;
  autoCallIntervalMs?: number | null;
  nextAutoCallAt?: string | null;
};

export type StructuralRefreshDecision =
  | { type: "ignore" }
  | { type: "refresh" }
  | { type: "patchAutoCall"; patch: AutoCallPatch };

export type NumberCalledRealtimeDecision =
  | { type: "ignore" }
  | {
      type: "apply";
      calledNumber: CalledNumber;
      autoCallSchedule: ReturnType<typeof parseAutoCallScheduleFromPayload>;
    };

export type GameOperationsRealtimeListenerMap = {
  connect: () => void;
  gameStatusChanged: (payload: unknown) => void;
  gameOperationUpdated: (payload: unknown) => void;
  gameNumberCalled: (payload: unknown) => void;
  gameBingoClaimed: (payload: unknown) => void;
  gameWinnerWindowStarted: (payload: unknown) => void;
  gameWinnerWindowJoined: (payload: unknown) => void;
  gameFinished: (payload: unknown) => void;
  gameCancelled: (payload: unknown) => void;
  sessionPrizeUpdated: (payload: unknown) => void;
  sessionCartelasUpdated: (payload: unknown) => void;
  slotStatusChanged: (payload: unknown) => void;
  slotEntryFeeUpdated: (payload: unknown) => void;
};

type RealtimeSocketLike = {
  on: (event: string, handler: (payload: unknown) => void) => void;
  off: (event: string, handler: (payload: unknown) => void) => void;
};

export function resolveStructuralRefreshDecision(
  payload: unknown,
): StructuralRefreshDecision {
  if (
    payload &&
    typeof payload === "object" &&
    "updatedReason" in payload
  ) {
    const reason = (payload as { updatedReason?: string }).updatedReason;

    if (reason === "number_called") {
      return { type: "ignore" };
    }

    if (reason === "auto_call_changed") {
      const data = payload as {
        sessionId?: string | null;
        slotId?: string | null;
        autoCallEnabled?: boolean;
        autoCallIntervalMs?: number | null;
        nextAutoCallAt?: string | null;
      };

      return {
        type: "patchAutoCall",
        patch: {
          sessionId: data.sessionId ?? undefined,
          slotId: data.slotId ?? undefined,
          autoCallEnabled: data.autoCallEnabled,
          autoCallIntervalMs: data.autoCallIntervalMs,
          nextAutoCallAt: data.nextAutoCallAt,
        },
      };
    }
  }

  return { type: "refresh" };
}

export function resolveNumberCalledRealtimeDecision(
  payload: unknown,
  activeSessionId: string | null | undefined,
): NumberCalledRealtimeDecision {
  const calledNumber = normalizeCalledNumberPayload(payload);

  if (
    calledNumber == null ||
    activeSessionId == null ||
    !isCalledNumberForActiveSession(calledNumber, activeSessionId)
  ) {
    return { type: "ignore" };
  }

  return {
    type: "apply",
    calledNumber,
    autoCallSchedule: parseAutoCallScheduleFromPayload(payload),
  };
}

export function registerGameOperationsRealtimeListeners(
  socket: RealtimeSocketLike,
  handlers: GameOperationsRealtimeListenerMap,
): () => void {
  const bindings = [
    ["connect", handlers.connect],
    ["game:status_changed", handlers.gameStatusChanged],
    ["game:operation_updated", handlers.gameOperationUpdated],
    ["game:number_called", handlers.gameNumberCalled],
    ["game:bingo_claimed", handlers.gameBingoClaimed],
    ["game:winner_window_started", handlers.gameWinnerWindowStarted],
    ["game:winner_window_joined", handlers.gameWinnerWindowJoined],
    ["game:finished", handlers.gameFinished],
    ["game:cancelled", handlers.gameCancelled],
    ["session:prize_updated", handlers.sessionPrizeUpdated],
    ["session:cartelas_updated", handlers.sessionCartelasUpdated],
    ["slot:status_changed", handlers.slotStatusChanged],
    ["slot:entry_fee_updated", handlers.slotEntryFeeUpdated],
  ] as const;

  bindings.forEach(([event, handler]) => {
    socket.on(event, handler);
  });

  return () => {
    bindings.forEach(([event, handler]) => {
      socket.off(event, handler);
    });
  };
}
