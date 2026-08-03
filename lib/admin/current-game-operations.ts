import {
  keepPreviousData,
  type QueryClient,
} from "@tanstack/react-query";

import {
  getCurrentGameOperations,
  type GameOperationsCurrentResponse,
} from "../api/admin";

import { operationsQueryKey } from "./game-operations-cache";

export const OPERATIONS_QUERY_STALE_TIME_MS = 2_000;
export const DEFAULT_OPERATIONS_FALLBACK_POLLING_MS = 15_000;
export const MIN_OPERATIONS_FALLBACK_POLLING_MS = 10_000;
export const OPERATIONS_RESUME_INACTIVITY_MS = 15_000;

let operationsRefreshInFlight: Promise<boolean> | null = null;
let lastOperationsRefreshAtMs: number | null = null;

export function createCurrentGameOperationsQueryOptions() {
  return {
    queryKey: operationsQueryKey,
    queryFn: getCurrentGameOperations,
    refetchOnWindowFocus: false as const,
    staleTime: OPERATIONS_QUERY_STALE_TIME_MS,
    refetchInterval: false as const,
    placeholderData: keepPreviousData,
    retry: (failureCount: number, queryError: unknown) => {
      if (
        typeof queryError === "object" &&
        queryError !== null &&
        "statusCode" in queryError &&
        queryError.statusCode === 429
      ) {
        return false;
      }

      return failureCount < 1;
    },
  };
}

export function getOperationsFallbackPollingMs(
  adminFallbackPollingSeconds?: number | null,
): number {
  const configuredMs =
    adminFallbackPollingSeconds == null
      ? DEFAULT_OPERATIONS_FALLBACK_POLLING_MS
      : adminFallbackPollingSeconds * 1000;

  return Math.max(MIN_OPERATIONS_FALLBACK_POLLING_MS, configuredMs);
}

export function isCurrentGameOperationsFetching(queryClient: QueryClient): boolean {
  return queryClient.isFetching({ queryKey: operationsQueryKey }) > 0;
}

export function isCurrentGameOperationsStale(
  queryClient: QueryClient,
  now = Date.now(),
): boolean {
  const state = queryClient.getQueryState<GameOperationsCurrentResponse>(
    operationsQueryKey,
  );

  if (!state?.dataUpdatedAt) {
    return true;
  }

  if (state.isInvalidated) {
    return true;
  }

  return now - state.dataUpdatedAt >= OPERATIONS_QUERY_STALE_TIME_MS;
}

export function getLastCurrentGameOperationsRefreshAt(): number | null {
  return lastOperationsRefreshAtMs;
}

export function resetCurrentGameOperationsTestState(): void {
  operationsRefreshInFlight = null;
  lastOperationsRefreshAtMs = null;
}

export function shouldRefreshCurrentGameOperationsOnResume(params: {
  hiddenDurationMs: number;
  disconnectedWhileHidden: boolean;
  isStale: boolean;
  lastRecoveryRefreshAtMs?: number | null;
  now?: number;
}): boolean {
  const now = params.now ?? Date.now();

  if (params.disconnectedWhileHidden) {
    return true;
  }

  if (params.hiddenDurationMs >= OPERATIONS_RESUME_INACTIVITY_MS) {
    return true;
  }

  if (!params.isStale) {
    return false;
  }

  if (params.lastRecoveryRefreshAtMs == null) {
    return true;
  }

  return now - params.lastRecoveryRefreshAtMs >= OPERATIONS_QUERY_STALE_TIME_MS;
}

export async function refreshCurrentGameOperations(
  queryClient: QueryClient,
  options: { staleOnly?: boolean } = {},
): Promise<boolean> {
  if (options.staleOnly && !isCurrentGameOperationsStale(queryClient)) {
    return false;
  }

  if (operationsRefreshInFlight) {
    return operationsRefreshInFlight;
  }

  operationsRefreshInFlight = (async () => {
    try {
      await queryClient.fetchQuery({
        ...createCurrentGameOperationsQueryOptions(),
        staleTime: 0,
      });
      lastOperationsRefreshAtMs = Date.now();
      return true;
    } finally {
      operationsRefreshInFlight = null;
    }
  })();

  return operationsRefreshInFlight;
}
