import type { QueryClient } from "@tanstack/react-query";

import type {
  GameOperationItem,
  GameOperationsCurrentResponse,
} from "@/lib/api/admin";
import type { AdminBingoClaim, CalledNumber } from "@/lib/api/types";

export const operationsQueryKey = ["games", "operations", "current"] as const;
export const bingoClaimsQueryKey = ["admin", "bingo-claims", "pending"] as const;

export const calledNumbersQueryKey = (sessionId: string) =>
  ["games", "called-numbers", sessionId] as const;

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
  updatedReason?: string;
};

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

export function appendCalledNumberToCache(
  queryClient: QueryClient,
  calledNumber: CalledNumber,
): void {
  const sessionId = calledNumber.gameSessionId;
  const queryKey = calledNumbersQueryKey(sessionId);

  queryClient.setQueryData<{ totalCount: number; calledNumbers: CalledNumber[] }>(
    queryKey,
    (current) => {
      const existing = current?.calledNumbers ?? [];
      const alreadyPresent = existing.some(
        (entry) =>
          entry.id === calledNumber.id ||
          (entry.letter === calledNumber.letter &&
            entry.number === calledNumber.number),
      );

      if (alreadyPresent) {
        return current;
      }

      const calledNumbers = [...existing, calledNumber];

      return {
        totalCount: calledNumbers.length,
        calledNumbers,
      };
    },
  );

  patchOperationsCache(queryClient, {
    sessionId,
    calledNumbersCount: calledNumber.order,
    latestCalledNumber: {
      letter: calledNumber.letter,
      number: calledNumber.number,
      order: calledNumber.order,
    },
    updatedReason: "number_called",
  });
}

export function applySocketOperationUpdate(
  queryClient: QueryClient,
  payload: unknown,
): "patched" | "refresh" {
  if (!payload || typeof payload !== "object") {
    return "refresh";
  }

  const patch = payload as OperationSocketPatch;
  const updatedReason = patch.updatedReason;

  if (updatedReason === "number_called") {
    if (patch.sessionId && patch.latestCalledNumber) {
      appendCalledNumberToCache(queryClient, {
        id: `socket-${patch.latestCalledNumber.order}`,
        gameSessionId: patch.sessionId,
        letter: patch.latestCalledNumber.letter,
        number: patch.latestCalledNumber.number,
        order: patch.latestCalledNumber.order,
        createdAt: new Date().toISOString(),
      });
      return "patched";
    }
  }

  const hasIncrementalPatch =
    patch.entryFee !== undefined ||
    patch.prizeAmount !== undefined ||
    patch.registeredCartelasCount !== undefined ||
    patch.calledNumbersCount !== undefined ||
    patch.latestCalledNumber !== undefined ||
    patch.autoCallEnabled !== undefined;

  if (hasIncrementalPatch && (patch.slotId || patch.sessionId)) {
    patchOperationsCache(queryClient, patch);
    return updatedReason === "auto_call_changed" ? "patched" : "patched";
  }

  return "refresh";
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
