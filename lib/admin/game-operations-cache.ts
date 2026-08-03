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
  noWinnerGraceEndsAt?: string | null;
  noWinnerReason?: string | null;
  updatedReason?: string;
  gameSlotId?: string;
};

type RealtimeGameRule = {
  id: string;
  name: string;
  key: string;
};

type SessionRealtimePayload = {
  sessionId?: string | null;
  id?: string | null;
  gameSlotId?: string | null;
  staticCode?: string;
  playCode?: string | null;
  status?: string | null;
  registrationOpen?: boolean;
  gameRule?: RealtimeGameRule | null;
  category?: GameOperationItem["category"];
  isBonus?: boolean;
  isBigGame?: boolean;
  fixedPrizeAmount?: string | null;
  maxCartelasPerPlayer?: number | null;
  entryFee?: string;
  prizePerCartela?: string;
  prizeAmount?: string;
  companyRevenue?: string;
  registeredCartelasCount?: number;
  calledNumbersCount?: number;
  winnerWindowEndsAt?: string | null;
  noWinnerGraceEndsAt?: string | null;
  noWinnerReason?: string | null;
  winnerPayoutsSummary?: GameOperationItem["winnerPayoutsSummary"];
  sessionOutcomeSummary?: GameOperationItem["sessionOutcomeSummary"];
  gameSlot?: {
    id?: string;
    sortOrder?: number | null;
  } | null;
};

type SlotRealtimePayload = {
  id?: string;
  slotId?: string;
  staticCode?: string;
  status?: string | null;
  gameRule?: RealtimeGameRule | null;
  category?: GameOperationItem["category"];
  isBonus?: boolean;
  isBigGame?: boolean;
  fixedPrizeAmount?: string | null;
  maxCartelasPerPlayer?: number | null;
  entryFee?: string;
  prizePerCartela?: string;
  sortOrder?: number | null;
  sessionId?: string | null;
  playCode?: string | null;
  prizeAmount?: string;
  registeredCartelasCount?: number;
  calledNumbersCount?: number;
  noWinnerGraceEndsAt?: string | null;
  noWinnerReason?: string | null;
};

const STATUS_PROGRESS_RANK: Record<string, number> = {
  NEXT: 0,
  READY: 1,
  PLAYING: 2,
  WINNER_WINDOW: 3,
  CHECKING: 4,
  FINISHED: 5,
  NO_WINNER: 5,
  CANCELLED: 5,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function getRealtimeStatusRank(status: string | null | undefined): number {
  if (!status) {
    return Number.NEGATIVE_INFINITY;
  }

  return STATUS_PROGRESS_RANK[status] ?? Number.NEGATIVE_INFINITY;
}

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

export function applyRealtimeCalledNumber(
  queryClient: QueryClient,
  sessionId: string,
  calledNumber: CalledNumber,
): void {
  upsertCalledNumber(queryClient, sessionId, calledNumber);
  patchOperationsCalledNumberCount(queryClient, sessionId, calledNumber);
}

export function readLiveCalledNumbers(
  queryClient: QueryClient,
  sessionId: string | null | undefined,
): CalledNumber[] {
  if (!sessionId) {
    return [];
  }

  const cached = queryClient.getQueryData<CalledNumbersCache>(
    calledNumbersQueryKey(sessionId),
  );

  return (cached?.calledNumbers ?? []).filter(
    (entry) => entry.gameSessionId === sessionId,
  );
}

export function upsertCalledNumber(
  queryClient: QueryClient,
  sessionId: string,
  calledNumber: CalledNumber,
): CalledNumbersCache {
  const queryKey = calledNumbersQueryKey(sessionId);
  const current = queryClient.getQueryData<CalledNumbersCache>(queryKey);

  if (
    current?.calledNumbers.some(
      (entry) =>
        entry.id === calledNumber.id ||
        (entry.order === calledNumber.order &&
          entry.number === calledNumber.number),
    )
  ) {
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

export function getLatestCalledNumberOrder(
  calledNumbers: CalledNumber[],
): number {
  if (calledNumbers.length === 0) {
    return 0;
  }

  return calledNumbers.reduce(
    (latest, entry) => Math.max(latest, entry.order),
    0,
  );
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
  if (patch.noWinnerGraceEndsAt !== undefined) {
    next.noWinnerGraceEndsAt = patch.noWinnerGraceEndsAt;
  }
  if (patch.noWinnerReason !== undefined) {
    next.noWinnerReason = patch.noWinnerReason;
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

function updateOperationsSnapshot(
  queryClient: QueryClient,
  updater: (
    current: GameOperationsCurrentResponse,
  ) => GameOperationsCurrentResponse | null,
): boolean {
  const current = queryClient.getQueryData<GameOperationsCurrentResponse>(
    operationsQueryKey,
  );

  if (!current) {
    return false;
  }

  const next = updater(current);
  if (!next) {
    return false;
  }

  queryClient.setQueryData<GameOperationsCurrentResponse>(operationsQueryKey, {
    ...next,
    timestamp: new Date().toISOString(),
  });
  return true;
}

function findMatchingOperationItem(
  current: GameOperationsCurrentResponse,
  target: { sessionId?: string | null; slotId?: string | null },
): GameOperationItem | null {
  const matches = (item: GameOperationItem | null | undefined) =>
    item != null &&
    ((target.sessionId != null && item.sessionId === target.sessionId) ||
      (target.slotId != null && item.slotId === target.slotId));

  if (matches(current.liveGame)) {
    return current.liveGame;
  }

  if (matches(current.checkingGame)) {
    return current.checkingGame;
  }

  if (matches(current.registrationOpenGame)) {
    return current.registrationOpenGame;
  }

  return current.queue.find(matches) ?? null;
}

function removeMatchingOperationItems(
  current: GameOperationsCurrentResponse,
  target: { sessionId?: string | null; slotId?: string | null },
): GameOperationsCurrentResponse {
  const matches = (item: GameOperationItem | null | undefined) =>
    item != null &&
    ((target.sessionId != null && item.sessionId === target.sessionId) ||
      (target.slotId != null && item.slotId === target.slotId));

  return {
    ...current,
    liveGame: matches(current.liveGame) ? null : current.liveGame,
    checkingGame: matches(current.checkingGame) ? null : current.checkingGame,
    registrationOpenGame: matches(current.registrationOpenGame)
      ? null
      : current.registrationOpenGame,
    queue: current.queue.filter((item) => !matches(item)),
  };
}

function applyOperationItemToBucket(
  current: GameOperationsCurrentResponse,
  item: GameOperationItem,
): GameOperationsCurrentResponse {
  const pruned = removeMatchingOperationItems(current, {
    sessionId: item.sessionId,
    slotId: item.slotId,
  });

  if (item.operationStatus === "live") {
    return { ...pruned, liveGame: item };
  }

  if (item.operationStatus === "checking") {
    return { ...pruned, checkingGame: item };
  }

  if (item.operationStatus === "registration") {
    return { ...pruned, registrationOpenGame: item };
  }

  return {
    ...pruned,
    queue: dedupeOperationQueue([...pruned.queue, item]),
  };
}

function derivePlayerStatus(
  status: string | null | undefined,
  fallback: GameOperationItem["playerStatus"],
): GameOperationItem["playerStatus"] {
  switch (status) {
    case "PLAYING":
      return "playing";
    case "WINNER_WINDOW":
      return "winnerWindow";
    case "CHECKING":
      return "checking";
    case "FINISHED":
    case "NO_WINNER":
      return "finished";
    case "CANCELLED":
      return "cancelled";
    case "READY":
    case "NEXT":
      return "registrationOpen";
    default:
      return fallback;
  }
}

function deriveOperationStatusForSession(
  payload: SessionRealtimePayload,
  fallback: GameOperationItem["operationStatus"],
): GameOperationItem["operationStatus"] {
  switch (payload.status) {
    case "PLAYING":
    case "WINNER_WINDOW":
      return "live";
    case "CHECKING":
      return "checking";
    case "READY":
      return payload.registrationOpen ? "registration" : "queue";
    default:
      return fallback;
  }
}

function mergeSessionOperationItem(
  base: GameOperationItem,
  payload: SessionRealtimePayload,
): GameOperationItem | null {
  const nextStatus = payload.status ?? base.rawStatus;
  if (
    payload.status &&
    getRealtimeStatusRank(payload.status) < getRealtimeStatusRank(base.rawStatus)
  ) {
    return null;
  }

  const operationStatus = deriveOperationStatusForSession(
    payload,
    base.operationStatus,
  );
  const playerStatus = derivePlayerStatus(nextStatus, base.playerStatus);

  return {
    ...base,
    slotId: payload.gameSlotId ?? base.slotId,
    sessionId: payload.sessionId ?? payload.id ?? base.sessionId,
    staticCode: payload.staticCode ?? base.staticCode,
    playCode:
      payload.playCode !== undefined ? payload.playCode : base.playCode,
    rawStatus: nextStatus,
    playerStatus,
    operationStatus,
    gameRule: payload.gameRule ?? base.gameRule,
    category: payload.category ?? base.category,
    isBonus: payload.isBonus ?? base.isBonus,
    isBigGame: payload.isBigGame ?? base.isBigGame,
    fixedPrizeAmount:
      payload.fixedPrizeAmount !== undefined
        ? payload.fixedPrizeAmount
        : base.fixedPrizeAmount,
    maxCartelasPerPlayer:
      payload.maxCartelasPerPlayer !== undefined
        ? payload.maxCartelasPerPlayer
        : base.maxCartelasPerPlayer,
    entryFee: payload.entryFee ?? base.entryFee,
    prizePerCartela: payload.prizePerCartela ?? base.prizePerCartela,
    prizeAmount: payload.prizeAmount ?? base.prizeAmount,
    companyRevenue: payload.companyRevenue ?? base.companyRevenue,
    registeredCartelasCount:
      payload.registeredCartelasCount ?? base.registeredCartelasCount,
    calledNumbersCount:
      payload.calledNumbersCount ?? base.calledNumbersCount,
    sortOrder: payload.gameSlot?.sortOrder ?? base.sortOrder,
    canRegister: payload.registrationOpen ?? base.canRegister,
    canStart:
      nextStatus === "READY" ? base.operationMode !== "AUTO" : false,
    canCallNumber: nextStatus === "PLAYING",
    winnerWindowEndsAt:
      payload.winnerWindowEndsAt !== undefined
        ? payload.winnerWindowEndsAt
        : base.winnerWindowEndsAt,
    noWinnerGraceEndsAt:
      payload.noWinnerGraceEndsAt !== undefined
        ? payload.noWinnerGraceEndsAt
        : base.noWinnerGraceEndsAt,
    noWinnerReason:
      payload.noWinnerReason !== undefined
        ? payload.noWinnerReason
        : base.noWinnerReason,
    sessionOutcomeSummary:
      payload.sessionOutcomeSummary ?? base.sessionOutcomeSummary,
    winnerPayoutsSummary:
      payload.winnerPayoutsSummary ?? base.winnerPayoutsSummary,
  };
}

function mergeSlotOperationItem(
  base: GameOperationItem,
  payload: SlotRealtimePayload,
): GameOperationItem {
  const nextStatus = payload.status ?? base.rawStatus;
  const operationStatus =
    base.operationStatus === "registration" || nextStatus === "READY"
      ? base.operationStatus
      : "queue";

  return {
    ...base,
    slotId: payload.slotId ?? payload.id ?? base.slotId,
    sessionId:
      payload.sessionId !== undefined ? payload.sessionId : base.sessionId,
    staticCode: payload.staticCode ?? base.staticCode,
    playCode:
      payload.playCode !== undefined ? payload.playCode : base.playCode,
    rawStatus: nextStatus,
    playerStatus: derivePlayerStatus(nextStatus, base.playerStatus),
    operationStatus,
    gameRule: payload.gameRule ?? base.gameRule,
    category: payload.category ?? base.category,
    isBonus: payload.isBonus ?? base.isBonus,
    isBigGame: payload.isBigGame ?? base.isBigGame,
    fixedPrizeAmount:
      payload.fixedPrizeAmount !== undefined
        ? payload.fixedPrizeAmount
        : base.fixedPrizeAmount,
    maxCartelasPerPlayer:
      payload.maxCartelasPerPlayer !== undefined
        ? payload.maxCartelasPerPlayer
        : base.maxCartelasPerPlayer,
    entryFee: payload.entryFee ?? base.entryFee,
    prizePerCartela: payload.prizePerCartela ?? base.prizePerCartela,
    prizeAmount: payload.prizeAmount ?? base.prizeAmount,
    registeredCartelasCount:
      payload.registeredCartelasCount ?? base.registeredCartelasCount,
    calledNumbersCount:
      payload.calledNumbersCount ?? base.calledNumbersCount,
    sortOrder:
      payload.sortOrder !== undefined ? payload.sortOrder : base.sortOrder,
    noWinnerGraceEndsAt:
      payload.noWinnerGraceEndsAt !== undefined
        ? payload.noWinnerGraceEndsAt
        : base.noWinnerGraceEndsAt,
    noWinnerReason:
      payload.noWinnerReason !== undefined
        ? payload.noWinnerReason
        : base.noWinnerReason,
  };
}

function isSessionRealtimePayload(payload: unknown): payload is SessionRealtimePayload {
  const record = asRecord(payload);
  return Boolean(
    record &&
      (typeof record.sessionId === "string" || typeof record.id === "string") &&
      (typeof record.gameSlotId === "string" || asRecord(record.gameSlot)),
  );
}

function isSlotRealtimePayload(payload: unknown): payload is SlotRealtimePayload {
  const record = asRecord(payload);
  return Boolean(
    record &&
      (typeof record.id === "string" || typeof record.slotId === "string") &&
      (typeof record.status === "string" || typeof record.staticCode === "string"),
  );
}

export function patchOperationsForStatusChanged(
  queryClient: QueryClient,
  payload: unknown,
): boolean {
  if (!isSessionRealtimePayload(payload)) {
    return false;
  }

  return updateOperationsSnapshot(queryClient, (current) => {
    const existing = findMatchingOperationItem(current, {
      sessionId: payload.sessionId ?? payload.id ?? null,
      slotId: payload.gameSlotId ?? payload.gameSlot?.id ?? null,
    });

    if (!existing) {
      return null;
    }

    const nextItem = mergeSessionOperationItem(existing, payload);
    if (!nextItem) {
      return current;
    }

    return applyOperationItemToBucket(current, nextItem);
  });
}

export function patchOperationsForRegistration(
  queryClient: QueryClient,
  payload: unknown,
): boolean {
  const record = asRecord(payload);
  if (!record) {
    return false;
  }

  const sessionId =
    typeof record.sessionId === "string" ? record.sessionId : null;
  const slotId =
    typeof record.slotId === "string"
      ? record.slotId
      : typeof record.gameSlotId === "string"
        ? record.gameSlotId
        : null;

  if (!sessionId && !slotId) {
    return false;
  }

  return patchOperationsCache(queryClient, {
    ...(sessionId ? { sessionId } : {}),
    ...(slotId ? { slotId } : {}),
    prizeAmount:
      typeof record.prizeAmount === "string" ? record.prizeAmount : undefined,
    registeredCartelasCount:
      typeof record.registeredCartelasCount === "number"
        ? record.registeredCartelasCount
        : undefined,
    calledNumbersCount:
      typeof record.calledNumbersCount === "number"
        ? record.calledNumbersCount
        : undefined,
  });
}

export function patchOperationsForWinnerWindow(
  queryClient: QueryClient,
  payload: unknown,
): boolean {
  const record = asRecord(payload);
  if (!record || typeof record.sessionId !== "string") {
    return false;
  }

  return updateOperationsSnapshot(queryClient, (current) => {
    const existing = findMatchingOperationItem(current, {
      sessionId:
        typeof record.sessionId === "string" ? record.sessionId : undefined,
    });

    if (!existing) {
      return null;
    }

    const nextItem: GameOperationItem = {
      ...existing,
      rawStatus: "WINNER_WINDOW",
      playerStatus: "winnerWindow",
      operationStatus: "live",
      winnerWindowEndsAt:
        typeof record.winnerWindowEndsAt === "string" ||
        record.winnerWindowEndsAt === null
          ? (record.winnerWindowEndsAt as string | null)
          : existing.winnerWindowEndsAt,
    };

    return applyOperationItemToBucket(current, nextItem);
  });
}

export function patchOperationsForFinished(
  queryClient: QueryClient,
  payload: unknown,
): boolean {
  const record = asRecord(payload);
  if (!record) {
    return false;
  }

  const sessionId =
    typeof record.sessionId === "string"
      ? record.sessionId
      : typeof record.id === "string"
        ? record.id
        : null;
  const slotId =
    typeof record.slotId === "string"
      ? record.slotId
      : typeof record.gameSlotId === "string"
        ? record.gameSlotId
        : typeof record.id === "string"
          ? record.id
          : null;

  if (!sessionId && !slotId) {
    return false;
  }

  return updateOperationsSnapshot(queryClient, (current) =>
    removeMatchingOperationItems(current, { sessionId, slotId }),
  );
}

export function patchOperationsFromCanonicalEvent(
  queryClient: QueryClient,
  payload: unknown,
): boolean {
  if (isSessionRealtimePayload(payload)) {
    return patchOperationsForStatusChanged(queryClient, payload);
  }

  if (!isSlotRealtimePayload(payload)) {
    return false;
  }

  return updateOperationsSnapshot(queryClient, (current) => {
    const slotId = payload.slotId ?? payload.id ?? null;
    const existing = findMatchingOperationItem(current, {
      sessionId: payload.sessionId ?? null,
      slotId,
    });

    if (!existing || !slotId) {
      return null;
    }

    const nextItem = mergeSlotOperationItem(existing, payload);
    return applyOperationItemToBucket(current, nextItem);
  });
}

export function isCalledNumberForActiveSession(
  calledNumber: CalledNumber,
  activeSessionId: string | null | undefined,
): boolean {
  return (
    activeSessionId != null &&
    activeSessionId.length > 0 &&
    calledNumber.gameSessionId === activeSessionId
  );
}

export function parseAutoCallScheduleFromPayload(
  payload: unknown,
): Pick<
  OperationSocketPatch,
  "nextAutoCallAt" | "autoCallEnabled" | "autoCallIntervalMs"
> | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as {
    nextAutoCallAt?: string | null;
    autoCallEnabled?: boolean;
    autoCallIntervalMs?: number | null;
  };

  if (!("nextAutoCallAt" in candidate) && candidate.autoCallEnabled !== true) {
    return null;
  }

  return {
    nextAutoCallAt: candidate.nextAutoCallAt,
    autoCallEnabled: candidate.autoCallEnabled,
    autoCallIntervalMs: candidate.autoCallIntervalMs,
  };
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

/**
 * Ensures at most one operations row per slot in the waiting queue.
 * When duplicates exist (bare NEXT slot + READY session), keep the session row.
 */
export function dedupeOperationQueue<T extends GameOperationItem>(
  items: T[],
): T[] {
  const bySlotId = new Map<string, T>();

  for (const item of items) {
    const existing = bySlotId.get(item.slotId);
    if (!existing) {
      bySlotId.set(item.slotId, item);
      continue;
    }

    if (!existing.sessionId && item.sessionId) {
      bySlotId.set(item.slotId, item);
    }
  }

  return [...bySlotId.values()].sort(
    (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0),
  );
}

export function getOperationItemKey(item: GameOperationItem): string {
  return item.sessionId
    ? `${item.slotId}:${item.sessionId}`
    : `${item.slotId}:slot`;
}

export function optimisticallyClearWaitingQueue(
  queryClient: QueryClient,
  options: {
    keptRegistration: boolean;
    cancelledEmptyRegistration: boolean;
  },
): void {
  const current = queryClient.getQueryData<GameOperationsCurrentResponse>(
    operationsQueryKey,
  );

  if (!current) {
    return;
  }

  queryClient.setQueryData<GameOperationsCurrentResponse>(operationsQueryKey, {
    ...current,
    registrationOpenGame:
      options.keptRegistration && !options.cancelledEmptyRegistration
        ? current.registrationOpenGame
        : null,
    queue: [],
    timestamp: new Date().toISOString(),
  });
}

const TERMINAL_GAME_STATUSES = new Set(["FINISHED", "NO_WINNER", "CANCELLED"]);

export function isTerminalGameStatus(
  status: string | null | undefined,
): boolean {
  return status != null && TERMINAL_GAME_STATUSES.has(status);
}

/**
 * Removes a finished/cancelled session from the cached operations buckets so
 * the UI never keeps showing a dead game while the immediate refetch is in
 * flight. The queue is left untouched (the slot lives on as a queued entry).
 */
export function dropTerminalSessionFromOperationsCache(
  queryClient: QueryClient,
  target: { sessionId?: string | null; slotId?: string | null },
): void {
  if (!target.sessionId && !target.slotId) {
    return;
  }

  const current = queryClient.getQueryData<GameOperationsCurrentResponse>(
    operationsQueryKey,
  );

  if (!current) {
    return;
  }

  const matches = (item: GameOperationItem | null) =>
    item != null &&
    ((target.sessionId != null && item.sessionId === target.sessionId) ||
      (target.slotId != null && item.slotId === target.slotId));

  if (
    !matches(current.liveGame) &&
    !matches(current.checkingGame) &&
    !matches(current.registrationOpenGame)
  ) {
    return;
  }

  queryClient.setQueryData<GameOperationsCurrentResponse>(operationsQueryKey, {
    ...current,
    liveGame: matches(current.liveGame) ? null : current.liveGame,
    checkingGame: matches(current.checkingGame) ? null : current.checkingGame,
    registrationOpenGame: matches(current.registrationOpenGame)
      ? null
      : current.registrationOpenGame,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Handles terminal game events by immediately dropping the session from cache
 * and triggering an immediate refetch. Use for game:finished, game:cancelled,
 * and terminal status_changed events.
 */
export function handleTerminalGameEvent(
  queryClient: QueryClient,
  target: { sessionId?: string | null; slotId?: string | null },
): void {
  // Immediately remove from UI cache
  dropTerminalSessionFromOperationsCache(queryClient, target);

  // Trigger immediate refetch for fresh operations state
  void queryClient.invalidateQueries({
    queryKey: operationsQueryKey,
    refetchType: 'active',
  });
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
