import { describe, expect, it, vi } from "vitest";

import {
  registerGameOperationsRealtimeListeners,
  resolveNumberCalledRealtimeDecision,
  resolveStructuralRefreshDecision,
  type GameOperationsRealtimeListenerMap,
} from "./game-operations-realtime";

function createHandlers(): GameOperationsRealtimeListenerMap {
  return {
    connect: vi.fn(),
    gameStatusChanged: vi.fn(),
    gameOperationUpdated: vi.fn(),
    gameNumberCalled: vi.fn(),
    gameBingoClaimed: vi.fn(),
    gameWinnerWindowStarted: vi.fn(),
    gameWinnerWindowJoined: vi.fn(),
    gameFinished: vi.fn(),
    gameCancelled: vi.fn(),
    sessionPrizeUpdated: vi.fn(),
    sessionCartelasUpdated: vi.fn(),
    slotStatusChanged: vi.fn(),
    slotEntryFeeUpdated: vi.fn(),
  };
}

describe("game-operations-realtime", () => {
  it("ignores legacy structural number_called updates so the full socket payload does not also trigger a REST refresh", () => {
    expect(
      resolveStructuralRefreshDecision({ updatedReason: "number_called" }),
    ).toEqual({ type: "ignore" });
  });

  it("patches auto-call updates without forcing a structural refresh", () => {
    expect(
      resolveStructuralRefreshDecision({
        updatedReason: "auto_call_changed",
        sessionId: "session-1",
        autoCallEnabled: true,
        autoCallIntervalMs: 7000,
        nextAutoCallAt: "2026-08-03T12:00:07.000Z",
      }),
    ).toEqual({
      type: "patchAutoCall",
      patch: {
        sessionId: "session-1",
        slotId: undefined,
        autoCallEnabled: true,
        autoCallIntervalMs: 7000,
        nextAutoCallAt: "2026-08-03T12:00:07.000Z",
      },
    });
  });

  it("uses the complete number_called socket payload directly for the active session", () => {
    expect(
      resolveNumberCalledRealtimeDecision(
        {
          id: "called-35",
          gameSessionId: "session-1",
          letter: "N",
          number: 42,
          order: 35,
          createdAt: "2026-08-03T12:00:00.000Z",
          autoCallEnabled: true,
          autoCallIntervalMs: 7000,
          nextAutoCallAt: "2026-08-03T12:00:07.000Z",
        },
        "session-1",
      ),
    ).toEqual({
      type: "apply",
      calledNumber: {
        id: "called-35",
        gameSessionId: "session-1",
        letter: "N",
        number: 42,
        order: 35,
        createdAt: "2026-08-03T12:00:00.000Z",
      },
      autoCallSchedule: {
        autoCallEnabled: true,
        autoCallIntervalMs: 7000,
        nextAutoCallAt: "2026-08-03T12:00:07.000Z",
      },
    });
  });

  it("registers and cleans up the live listeners idempotently", () => {
    const listeners = new Map<string, Set<(payload: unknown) => void>>();
    const socket = {
      on(event: string, handler: (payload: unknown) => void) {
        if (!listeners.has(event)) {
          listeners.set(event, new Set());
        }

        listeners.get(event)!.add(handler);
      },
      off(event: string, handler: (payload: unknown) => void) {
        listeners.get(event)?.delete(handler);
      },
    };

    const handlers = createHandlers();

    const cleanupA = registerGameOperationsRealtimeListeners(socket, handlers);
    expect(
      [...listeners.values()].reduce((count, bucket) => count + bucket.size, 0),
    ).toBe(13);

    cleanupA();
    expect(
      [...listeners.values()].reduce((count, bucket) => count + bucket.size, 0),
    ).toBe(0);

    const cleanupB = registerGameOperationsRealtimeListeners(socket, handlers);
    expect(
      [...listeners.values()].reduce((count, bucket) => count + bucket.size, 0),
    ).toBe(13);

    cleanupB();
    expect(
      [...listeners.values()].reduce((count, bucket) => count + bucket.size, 0),
    ).toBe(0);
  });
});
