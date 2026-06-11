import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import type { GameOperationsCurrentResponse } from "@/lib/api/admin";
import type { CalledNumber } from "@/lib/api/types";

import {
  calledNumbersQueryKey,
  mergeCalledNumbersLists,
  mergeCalledNumbersResponse,
  normalizeCalledNumberPayload,
  operationsQueryKey,
  patchOperationsCalledNumberCount,
  upsertCalledNumber,
} from "./game-operations-cache";

function createCalledNumber(
  order: number,
  number: number,
  id = `called-${order}`,
  gameSessionId = "session-1",
): CalledNumber {
  return {
    id,
    gameSessionId,
    letter: "B",
    number,
    order,
    createdAt: `2026-06-10T12:00:${String(order).padStart(2, "0")}.000Z`,
  };
}

function createOperationsState(): GameOperationsCurrentResponse {
  return {
    liveGame: {
      slotId: "slot-1",
      sessionId: "session-1",
      staticCode: "AUTO-S1",
      playCode: "BINGO-123",
      rawStatus: "PLAYING",
      playerStatus: "playing",
      operationStatus: "live",
      gameRule: { id: "rule-1", name: "Auto", key: "AUTO" },
      entryFee: "10",
      prizePerCartela: "8",
      prizeAmount: "16",
      companyRevenue: "4",
      registeredCartelasCount: 2,
      calledNumbersCount: 34,
      sortOrder: 1,
      winnerCartelaId: null,
      startedAt: "2026-06-10T12:00:00.000Z",
      finishedAt: null,
      operationMode: "AUTO",
      registrationDurationSeconds: 60,
      autoCallIntervalSeconds: 7,
      scheduledStartAt: null,
      registrationOpen: false,
      canStart: false,
      canRegister: false,
      canCallNumber: true,
      canClaimBingo: true,
      autoCallEnabled: true,
      autoCallIntervalMs: 7000,
    },
    checkingGame: null,
    registrationOpenGame: null,
    queue: [],
    timestamp: "2026-06-10T12:00:00.000Z",
  };
}

describe("game-operations-cache", () => {
  it("normalizes game:number_called payloads with gameSessionId", () => {
    expect(
      normalizeCalledNumberPayload({
        id: "called-1",
        gameSessionId: "session-1",
        letter: "B",
        number: 12,
        order: 1,
        createdAt: "2026-06-10T12:00:07.000Z",
      }),
    ).toEqual({
      id: "called-1",
      gameSessionId: "session-1",
      letter: "B",
      number: 12,
      order: 1,
      createdAt: "2026-06-10T12:00:07.000Z",
    });
  });

  it("appends events 35, 36, and 37 without dropping any", () => {
    const queryClient = new QueryClient();
    const existing = Array.from({ length: 34 }, (_, index) =>
      createCalledNumber(index + 1, index + 1),
    );

    queryClient.setQueryData(calledNumbersQueryKey("session-1"), {
      totalCount: 34,
      calledNumbers: existing,
    });

    upsertCalledNumber(queryClient, "session-1", createCalledNumber(35, 42, "n-35"));
    upsertCalledNumber(queryClient, "session-1", createCalledNumber(36, 17, "n-36"));
    upsertCalledNumber(queryClient, "session-1", createCalledNumber(37, 63, "n-37"));

    const calledNumbers = queryClient.getQueryData<{
      calledNumbers: CalledNumber[];
    }>(calledNumbersQueryKey("session-1"));

    expect(calledNumbers?.calledNumbers).toHaveLength(37);
    expect(calledNumbers?.calledNumbers.map((entry) => entry.order)).toEqual(
      Array.from({ length: 37 }, (_, index) => index + 1),
    );
    expect(calledNumbers?.calledNumbers.at(-1)?.number).toBe(63);
  });

  it("ignores duplicate events by id", () => {
    const queryClient = new QueryClient();
    const entry = createCalledNumber(35, 42, "n-35");

    upsertCalledNumber(queryClient, "session-1", entry);
    upsertCalledNumber(queryClient, "session-1", entry);

    const calledNumbers = queryClient.getQueryData<{
      calledNumbers: CalledNumber[];
    }>(calledNumbersQueryKey("session-1"));

    expect(calledNumbers?.calledNumbers).toHaveLength(1);
  });

  it("sorts out-of-order events by order ascending", () => {
    const merged = mergeCalledNumbersLists(
      [createCalledNumber(2, 12, "n-2")],
      [createCalledNumber(1, 5, "n-1")],
      [createCalledNumber(3, 29, "n-3")],
    );

    expect(merged.map((entry) => entry.order)).toEqual([1, 2, 3]);
  });

  it("keeps socket-appended numbers when server response is stale", () => {
    const cached = {
      totalCount: 37,
      calledNumbers: Array.from({ length: 37 }, (_, index) =>
        createCalledNumber(index + 1, index + 1),
      ),
    };
    const server = {
      totalCount: 34,
      calledNumbers: cached.calledNumbers.slice(0, 34),
    };

    const merged = mergeCalledNumbersResponse(server, cached);

    expect(merged.calledNumbers).toHaveLength(37);
    expect(merged.calledNumbers.at(-1)?.order).toBe(37);
  });

  it("prefers real ids over synthetic socket ids for the same order", () => {
    const merged = mergeCalledNumbersLists(
      [createCalledNumber(35, 42, "socket-35")],
      [createCalledNumber(35, 42, "real-uuid-35")],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("real-uuid-35");
  });

  it("patches operations count and latest ball from number_called", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(operationsQueryKey, createOperationsState());

    const patched = patchOperationsCalledNumberCount(
      queryClient,
      "session-1",
      createCalledNumber(35, 42, "n-35"),
    );

    const operations = queryClient.getQueryData<GameOperationsCurrentResponse>(
      operationsQueryKey,
    );

    expect(patched).toBe(true);
    expect(operations?.liveGame?.calledNumbersCount).toBe(35);
    expect(operations?.liveGame?.latestCalledNumber).toEqual({
      letter: "B",
      number: 42,
      order: 35,
    });
  });

  it("uses separate cache keys per session", () => {
    const queryClient = new QueryClient();

    upsertCalledNumber(
      queryClient,
      "session-a",
      createCalledNumber(1, 1, "a-1", "session-a"),
    );
    upsertCalledNumber(
      queryClient,
      "session-b",
      createCalledNumber(1, 2, "b-1", "session-b"),
    );

    const sessionA = queryClient.getQueryData<{ calledNumbers: CalledNumber[] }>(
      calledNumbersQueryKey("session-a"),
    );
    const sessionB = queryClient.getQueryData<{ calledNumbers: CalledNumber[] }>(
      calledNumbersQueryKey("session-b"),
    );

    expect(sessionA?.calledNumbers[0]?.gameSessionId).toBe("session-a");
    expect(sessionB?.calledNumbers[0]?.gameSessionId).toBe("session-b");
    expect(sessionA?.calledNumbers[0]?.number).toBe(1);
    expect(sessionB?.calledNumbers[0]?.number).toBe(2);
  });
});
