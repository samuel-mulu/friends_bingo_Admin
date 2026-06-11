import type { QueryClient } from "@tanstack/react-query";

import type {
  GameOperationItem,
  GameOperationsCurrentResponse,
} from "@/lib/api/admin";
import type { AdminBingoClaim, CalledNumber } from "@/lib/api/types";

export const operationsQueryKey = ["games", "operations", "current"] as const;
export const bingoClaimsQueryKey = ["admin", "bingo-claims", "pending"] as const;

export const calledNumbersQueryKey = (sessionId: string) =>
  ["admin", "called-numbers", sessionId] as const;

export type CalledNumbersCache = {
  totalCount: number;
  calledNumbers: CalledNumber[];
};

type OperationSocketPatch = {
  slotId?: string;
  sessionId?: string | null;
  status?: string;
  entryFee?: string;
  prizeAmount?: string;
  registeredCartelasCount?: number;
  calledNumbersCount?: number;
  latestCalledNumber?: {
    letter: string;
    number: number;
    order: number;
  } | null;
  autoCallEnabled?: boolean;
  autoCallIntervalMs?: number | null;
  nextAutoCallAt?: string | null;
  updatedReason?: string;
  gameSlotId?: string;
};

function isSyntheticCalledNumberId(id: string): boolean {
  return id.startsWith("socket-") || id.startsWith("optimistic-");
}

function pickPreferredCalledNumber(
  existing: CalledNumber,
  incoming: CalledNumber,
): CalledNumber {
  if (isSyntheticCalledNumberId(existing.id) && !isSyntheticCalledNumberId(incoming.id)) {
    return incoming;
  }

  if (!isSyntheticCalledNumberId(existing.id) && isSyntheticCalledNumberId(incoming.id)) {
    return existing;
  }

  return incoming;
}

export function mergeCalledNumbersLists(
  ...sources: (CalledNumber[] | undefined)[]
): CalledNumber[] {
  const byOrder = new Map<number, CalledNumber>();

  for (const source of sources) {
    for (const entry of source ?? []) {
      const existing = byOrder.get(entry.order);
      if (!existing) {
        byOrder.set(entry.order, entry);
        continue;
      }

      byOrder.set(entry.order, pickPreferredCalledNumber(existing, entry));
    }
  }

  return [...byOrder.values()].sort((left, right) => left.order - right.order);
}

export function mergeCalledNumbersResponse(
  server: CalledNumbersCache,
  cached: CalledNumbersCache | undefined,
): CalledNumbersCache {
  const calledNumbers = mergeCalledNumbersLists(
    cached?.calledNumbers,
    server.calledNumbers,
  );

  return {
    totalCount: calledNumbers.length,
    calledNumbers,
  };
}

export function patchOperationsCalledNumberCount(
  queryClient: QueryClient,
  sessionId: string,
  calledNumber: CalledNumber,
): boolean {
  return patchOperationsCache(queryClient, {
    sessionId,
    calledNumbersCount: calledNumber.order,
    latestCalledNumber: {
      letter: calledNumber.letter,
      number: calledNumber.number,
      order: calledNumber.order,
    },
  });
}

export function upsertCalledNumber(
  queryClient: QueryClient,
  sessionId: string,
  calledNumber: CalledNumber,
): CalledNumbersCache {
  const queryKey = calledNumbersQueryKey(sessionId);
  const current = queryClient.getQueryData<CalledNumbersCache>(queryKey);

  if (current?.calledNumbers.some((entry) => entry.id === calledNumber.id)) {
    return current;
  }

  const calledNumbers = mergeCalledNumbersLists(current?.calledNumbers, [
    calledNumber,
  ]);
  const next: CalledNumbersCache = {
    totalCount: calledNumbers.length,
    calledNumbers,
  };

  queryClient.setQueryData(queryKey, next);
  return next;
}

export function logCalledNumberEvent(calledNumber: CalledNumber): void {
  if (process.env.NODE_ENV === "development") {
    console.debug("[game:number_called]", {
      id: calledNumber.id,
      order: calledNumber.order,
      number: calledNumber.number,
      sessionId: calledNumber.gameSessionId,
    });
  }
}

function patchGameItem(
  item: GameOperationItem,
  patch: OperationSocketPatch,
): GameOperationItem {
  const next: GameOperationItem = { ...item };

  if (patch.entryFee !== undefined) {
    next.entryFee = patch.entryFee;
  }
  if (patch.prizeAmount !== undefined) {
    next.prizeAmount = patch.prizeAmount;
  }
  if (patch.registeredCartelasCount !== undefined) {
    next.registeredCartelasCount = patch.registeredCartelasCount;
  }
  if (patch.calledNumbersCount !== undefined) {
    next.calledNumbersCount = patch.calledNumbersCount;
  }
  if (patch.latestCalledNumber !== undefined) {
    next.latestCalledNumber = patch.latestCalledNumber;
  }
  if (patch.autoCallEnabled !== undefined) {
    next.autoCallEnabled = patch.autoCallEnabled;
  }
  if (patch.autoCallIntervalMs !== undefined && patch.autoCallIntervalMs !== null) {
    next.autoCallIntervalMs = patch.autoCallIntervalMs;
  }
  if (patch.nextAutoCallAt !== undefined) {
    next.nextAutoCallAt = patch.nextAutoCallAt;
  }
  if (patch.status !== undefined) {
    next.rawStatus = patch.status;
  }

  return next;
}

function matchesOperationTarget(
  item: GameOperationItem,
  patch: OperationSocketPatch,
): boolean {
  if (patch.sessionId && item.sessionId === patch.sessionId) {
    return true;
  }

  if (patch.slotId && item.slotId === patch.slotId) {
    return true;
  }

  return false;
}

function patchOperationsSection(
  item: GameOperationItem | null,
  patch: OperationSocketPatch,
): GameOperationItem | null {
  if (!item || !matchesOperationTarget(item, patch)) {
    return item;
  }

  return patchGameItem(item, patch);
}

export function patchOperationsCache(
  queryClient: QueryClient,
  patch: OperationSocketPatch,
): boolean {
  const current = queryClient.getQueryData<GameOperationsCurrentResponse>(
    operationsQueryKey,
  );

  if (!current) {
    return false;
  }

  queryClient.setQueryData<GameOperationsCurrentResponse>(operationsQueryKey, {
    ...current,
    liveGame: patchOperationsSection(current.liveGame, patch),
    checkingGame: patchOperationsSection(current.checkingGame, patch),
    registrationOpenGame: patchOperationsSection(
      current.registrationOpenGame,
      patch,
    ),
    queue: current.queue.map((item) =>
      matchesOperationTarget(item, patch) ? patchGameItem(item, patch) : item,
    ),
    timestamp: new Date().toISOString(),
  });

  return true;
}

export function normalizeCalledNumberPayload(payload: unknown): CalledNumber | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Partial<CalledNumber> & {
    sessionId?: string;
  };

  const gameSessionId = candidate.gameSessionId ?? candidate.sessionId;
  if (
    !gameSessionId ||
    typeof candidate.letter !== "string" ||
    typeof candidate.number !== "number" ||
    typeof candidate.order !== "number"
  ) {
    return null;
  }

  return {
    id: candidate.id ?? `socket-${candidate.order}`,
    gameSessionId,
    letter: candidate.letter,
    number: candidate.number,
    order: candidate.order,
    createdAt: candidate.createdAt ?? new Date().toISOString(),
  };
}

export function invalidateOperationsCache(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: operationsQueryKey });
}

export function refetchCalledNumbersForSession(
  queryClient: QueryClient,
  sessionId: string | null | undefined,
): void {
  if (!sessionId) {
    return;
  }

  void queryClient.invalidateQueries({
    queryKey: calledNumbersQueryKey(sessionId),
  });
}

export function optimisticallyReorderQueue(
  queryClient: QueryClient,
  slotIds: string[],
): GameOperationsCurrentResponse | undefined {
  const current = queryClient.getQueryData<GameOperationsCurrentResponse>(
    operationsQueryKey,
  );

  if (!current) {
    return undefined;
  }

  const reorderable = [
    ...(current.registrationOpenGame ? [current.registrationOpenGame] : []),
    ...current.queue,
  ].sort(
    (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0),
  );

  const ordered: GameOperationItem[] = [];

  slotIds.forEach((slotId, index) => {
    const item = reorderable.find((slot) => slot.slotId === slotId);
    if (item) {
      ordered.push({ ...item, sortOrder: index + 1 });
    }
  });

  const [nextRegistration, ...nextQueue] = ordered;

  const nextState: GameOperationsCurrentResponse = {
    ...current,
    registrationOpenGame: nextRegistration ?? null,
    queue: nextQueue,
    timestamp: new Date().toISOString(),
  };

  queryClient.setQueryData(operationsQueryKey, nextState);
  return current;
}

export function optimisticallyPatchEntryFee(
  queryClient: QueryClient,
  slotId: string,
  entryFee: string,
): GameOperationsCurrentResponse | undefined {
  const current = queryClient.getQueryData<GameOperationsCurrentResponse>(
    operationsQueryKey,
  );

  if (!current) {
    return undefined;
  }

  patchOperationsCache(queryClient, { slotId, entryFee });
  return current;
}

export function optimisticallyRemoveBingoClaim(
  queryClient: QueryClient,
  claimId: string,
): AdminBingoClaim[] | undefined {
  const current = queryClient.getQueryData<AdminBingoClaim[]>(bingoClaimsQueryKey);

  if (!current) {
    return undefined;
  }

  queryClient.setQueryData(
    bingoClaimsQueryKey,
    current.filter((claim) => claim.id !== claimId),
  );

  return current;
}

export function createOptimisticCalledNumber(
  sessionId: string,
  payload: { letter: string; number: number },
  order: number,
): CalledNumber {
  return {
    id: `optimistic-${Date.now()}`,
    gameSessionId: sessionId,
    letter: payload.letter,
    number: payload.number,
    order,
    createdAt: new Date().toISOString(),
  };
}
