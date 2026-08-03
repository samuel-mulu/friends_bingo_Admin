import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GameOperationsCurrentResponse } from "../api/admin";

import {
  createCurrentGameOperationsQueryOptions,
  getLastCurrentGameOperationsRefreshAt,
  getOperationsFallbackPollingMs,
  isCurrentGameOperationsStale,
  resetCurrentGameOperationsTestState,
  refreshCurrentGameOperations,
  shouldRefreshCurrentGameOperationsOnResume,
} from "./current-game-operations";

const getCurrentGameOperationsMock = vi.fn<
  () => Promise<GameOperationsCurrentResponse>
>();

vi.mock("../api/admin", () => {
  return {
    getCurrentGameOperations: () => getCurrentGameOperationsMock(),
  };
});

function createOperationsResponse(
  version: number,
): GameOperationsCurrentResponse {
  return {
    liveGame: null,
    checkingGame: null,
    registrationOpenGame: null,
    queue: [],
    operationsVersion: version,
    timestamp: `2026-08-03T12:00:0${version}.000Z`,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

async function waitForIdle(queryClient: QueryClient): Promise<void> {
  while (queryClient.isFetching() > 0) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("current-game-operations", () => {
  afterEach(() => {
    getCurrentGameOperationsMock.mockReset();
    resetCurrentGameOperationsTestState();
  });

  it("requests operations once on initial mount", async () => {
    const deferred = createDeferred<GameOperationsCurrentResponse>();
    const queryClient = new QueryClient();
    const observer = new QueryObserver(
      queryClient,
      createCurrentGameOperationsQueryOptions(),
    );

    getCurrentGameOperationsMock.mockReturnValueOnce(deferred.promise);

    const unsubscribe = observer.subscribe(() => undefined);

    expect(getCurrentGameOperationsMock).toHaveBeenCalledTimes(1);

    deferred.resolve(createOperationsResponse(1));
    await waitForIdle(queryClient);

    expect(observer.getCurrentResult().data?.operationsVersion).toBe(1);

    unsubscribe();
  });

  it("shares one request across two consumers using the same query key", async () => {
    const deferred = createDeferred<GameOperationsCurrentResponse>();
    const queryClient = new QueryClient();
    const observerA = new QueryObserver(
      queryClient,
      createCurrentGameOperationsQueryOptions(),
    );
    const observerB = new QueryObserver(
      queryClient,
      createCurrentGameOperationsQueryOptions(),
    );

    getCurrentGameOperationsMock.mockReturnValueOnce(deferred.promise);

    const unsubscribeA = observerA.subscribe(() => undefined);
    const unsubscribeB = observerB.subscribe(() => undefined);

    expect(getCurrentGameOperationsMock).toHaveBeenCalledTimes(1);

    deferred.resolve(createOperationsResponse(2));
    await waitForIdle(queryClient);

    expect(observerA.getCurrentResult().data?.operationsVersion).toBe(2);
    expect(observerB.getCurrentResult().data?.operationsVersion).toBe(2);

    unsubscribeA();
    unsubscribeB();
  });

  it("manual and reconnect refreshes join in-flight work instead of starting a second request", async () => {
    const queryClient = new QueryClient();
    const observer = new QueryObserver(
      queryClient,
      createCurrentGameOperationsQueryOptions(),
    );

    getCurrentGameOperationsMock.mockResolvedValueOnce(createOperationsResponse(1));
    const unsubscribe = observer.subscribe(() => undefined);
    await waitForIdle(queryClient);

    const deferred = createDeferred<GameOperationsCurrentResponse>();
    getCurrentGameOperationsMock.mockReturnValueOnce(deferred.promise);

    const reconnectRefresh = refreshCurrentGameOperations(queryClient);
    const focusRefresh = refreshCurrentGameOperations(queryClient);

    expect(getCurrentGameOperationsMock).toHaveBeenCalledTimes(2);

    deferred.resolve(createOperationsResponse(3));
    await Promise.all([reconnectRefresh, focusRefresh]);
    expect(getLastCurrentGameOperationsRefreshAt()).not.toBeNull();

    unsubscribe();
  });

  it("visible-tab stale refresh skips a fresh query", async () => {
    const queryClient = new QueryClient();
    const observer = new QueryObserver(
      queryClient,
      createCurrentGameOperationsQueryOptions(),
    );

    getCurrentGameOperationsMock.mockResolvedValueOnce(createOperationsResponse(1));
    const unsubscribe = observer.subscribe(() => undefined);
    await waitForIdle(queryClient);

    const refreshed = await refreshCurrentGameOperations(queryClient, {
      staleOnly: true,
    });

    expect(refreshed).toBe(false);
    expect(isCurrentGameOperationsStale(queryClient)).toBe(false);
    expect(getCurrentGameOperationsMock).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("uses a 15s default fallback and clamps configured intervals to 10s minimum", () => {
    expect(getOperationsFallbackPollingMs(undefined)).toBe(15_000);
    expect(getOperationsFallbackPollingMs(5)).toBe(10_000);
    expect(getOperationsFallbackPollingMs(12)).toBe(12_000);
  });

  it("refreshes on resume after meaningful inactivity or hidden disconnects only", () => {
    expect(
      shouldRefreshCurrentGameOperationsOnResume({
        hiddenDurationMs: 16_000,
        disconnectedWhileHidden: false,
        isStale: false,
      }),
    ).toBe(true);

    expect(
      shouldRefreshCurrentGameOperationsOnResume({
        hiddenDurationMs: 2_000,
        disconnectedWhileHidden: true,
        isStale: false,
      }),
    ).toBe(true);

    expect(
      shouldRefreshCurrentGameOperationsOnResume({
        hiddenDurationMs: 2_000,
        disconnectedWhileHidden: false,
        isStale: false,
      }),
    ).toBe(false);
  });
});
