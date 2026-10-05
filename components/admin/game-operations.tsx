"use client";

/**
 * Game Operations - CANONICAL SOURCE OF TRUTH
 *
 * This component uses the backend's canonical endpoint GET /games/operations/current
 * which returns the exact same game selection for both Admin and Flutter.
 *
 * Backend decides priority: PLAYING > CHECKING > READY > NEXT
 * Frontend MUST NOT apply additional filtering or sorting.
 *
 * Sections:
 * A. CURRENT GAME = liveGame or checkingGame
 * B. NEXT REGISTRATION = registrationOpenGame (when not the current game)
 * C. QUEUE = response.queue
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Ban,
  CheckCircle2,
  Clock3,
  Loader2,
  PauseCircle,
  Phone,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Target,
  Trash2,
  Trophy,
  Users,
  XCircle,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

import {
  approveAdminBingoClaim,
  callAdminGameNumber,
  cancelBlockingSession,
  clearAdminQueue,
  createAdminGame,
  finishWinnerWindow as finishWinnerWindowCommand,
  updateAdminSlotOperationMode,
  getAdminBingoClaims,
  getAdminGameRules,
  getAdminTimeConfig,
  updateAdminTimeConfig,
  getCurrentBigGame,
  getGameCalledNumbers,
  getSessionRegisteredPlayers,
  rejectAdminBingoClaim,
  reorderAdminSlots,
  continueAdminChainRoundNow,
  extendAdminChainRoundPause,
  startAdminGame,
  startAdminBigGameNextRound,
  startAdminBigGameNow,
  startSessionAutoCall,
  stopSessionAutoCall,
  updateAdminGameStatus,
  updateAdminBigGameSchedule,
  updateAdminSlotEntryFee,
  type GameOperationItem,
  type GameOperationsCurrentResponse,
} from "@/lib/api/admin";
import { ConfirmActionDialog } from "@/components/admin/confirm-action-dialog";
import { LoadingButton } from "@/components/admin/loading-button";
import { getApiErrorMessage, isApiRateLimitError } from "@/lib/api/errors";
import { ApiError } from "@/lib/api/client";
import {
  buildCreateGameRequestBody,
  datetimeLocalToIso,
  isoToDatetimeLocal,
  validateBigGameScheduleOrder,
  getApplyOperationModeDescription,
  buildOperationModeSwitchPayload,
  getApplyOperationModePrompt,
  getCreateFormDefaults,
  getFocusedGameForModeSwitch,
  getGameOperationStatusHint,
  getOperationModeLockReason,
  readStoredDefaultOperationMode,
  resolveAutoCallIntervalMs,
  shouldPromptApplyModeToCurrentGame,
  writeStoredDefaultOperationMode,
} from "@/lib/admin/game-operation-defaults";
import {
  isMutationPendingFor,
  useAdminMutation,
} from "@/lib/admin/use-admin-mutation";
import type {
  AdminBingoClaim,
  CallNumberPayload,
  CalledNumber,
  CreateGamePayload,
  GameCategory,
  GameOperationMode,
  GameRuleSummary,
} from "@/lib/api/types";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";

function isBigGameOperationItem(
  item:
    | {
        category?: GameOperationItem["category"] | null;
        isBigGame?: boolean | null;
      }
    | null
    | undefined,
): boolean {
  return Boolean(item?.isBigGame || item?.category === "BIG_GAME");
}

function isChainGameOperationItem(
  item:
    | {
        category?: GameOperationItem["category"] | null;
        isChainGame?: boolean | null;
      }
    | null
    | undefined,
): boolean {
  return Boolean(item?.isChainGame || item?.category === "CHAIN_GAME");
}

/**
 * Presentation only — for the round badge and round prize. Never branch game
 * lifecycle on this: Big Game creates a session per round while Chain Game plays
 * every round inside one session.
 */
function isMultiRoundOperationItem(
  item:
    | {
        category?: GameOperationItem["category"] | null;
        isBigGame?: boolean | null;
        isChainGame?: boolean | null;
      }
    | null
    | undefined,
): boolean {
  return isBigGameOperationItem(item) || isChainGameOperationItem(item);
}

/** Seconds left on a Chain Game inter-round pause, or null when not paused. */
function resolveChainPauseSecondsRemaining(
  item: Pick<GameOperationItem, "roundPausedUntil"> | null | undefined,
  now: number,
): number | null {
  if (!item?.roundPausedUntil) {
    return null;
  }
  const endsAt = new Date(item.roundPausedUntil).getTime();
  if (!Number.isFinite(endsAt)) {
    return null;
  }
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

function isBonusOperationItem(
  item: Pick<GameOperationItem, "category" | "isBonus"> | null | undefined,
): boolean {
  return Boolean(item?.isBonus || item?.category === "BONUS");
}

function isBigGotdOperationItem(
  item: Pick<GameOperationItem, "category"> | null | undefined,
): boolean {
  return item?.category === "BIG_GOTD";
}

function isNormalOperationItem(
  item: Pick<GameOperationItem, "category"> | null | undefined,
): boolean {
  return item?.category === "NORMAL";
}

function computePrizePerCartelaFromEconomics(
  entryFee: string,
  commission: string,
): string {
  const entry = Number(entryFee);
  const fee = Number(commission);
  if (!Number.isFinite(entry) || !Number.isFinite(fee)) {
    return "0";
  }
  const prize = entry - fee;
  return prize >= 0 ? prize.toFixed(2).replace(/\.00$/, "") : "0";
}

/** A one-round chain is just a Big GOTD, so the backend rejects it. */
const CHAIN_GAME_MIN_ROUND_COUNT = 2;
const CHAIN_GAME_MIN_INTER_ROUND_DELAY_SECONDS = 5;
const CHAIN_GAME_MAX_INTER_ROUND_DELAY_SECONDS = 300;
const CHAIN_GAME_DEFAULT_INTER_ROUND_DELAY_SECONDS = "20";
/** Seconds added by the live-ops "+20s" control during an inter-round pause. */
const CHAIN_GAME_PAUSE_EXTENSION_SECONDS = 20;

function resizeRoundPrizeDrafts(prizes: string[], count: number): string[] {
  if (count <= 0) {
    return [];
  }
  if (prizes.length === count) {
    return prizes;
  }
  if (prizes.length > count) {
    return prizes.slice(0, count);
  }
  return [...prizes, ...Array.from({ length: count - prizes.length }, () => "")];
}

function resizeRoundRuleDrafts(
  ruleIds: string[],
  count: number,
  fallbackRuleId: string,
): string[] {
  if (count <= 0) {
    return [];
  }
  const next = ruleIds.slice(0, count);
  while (next.length < count) {
    next.push(fallbackRuleId || next[0] || "");
  }
  if (fallbackRuleId && !next[0]) {
    next[0] = fallbackRuleId;
  }
  return next;
}

function sumMoneyDrafts(values: string[]): number | null {
  let totalCents = 0;
  for (const value of values) {
    const amount = Number(value.trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }
    totalCents += Math.round(amount * 100);
  }
  return totalCents / 100;
}

function resolveDisplayedRoundIndex(game: {
  roundIndex?: number | null;
  currentRound?: number | null;
}): number {
  return game.roundIndex ?? game.currentRound ?? 1;
}

function resolveCurrentRoundPrize(game: {
  roundIndex?: number | null;
  currentRound?: number | null;
  roundPrizes?: string[] | null;
  roundPrizeAmount?: string | null;
  fixedPrizeAmount?: string | null;
  prizeAmount?: string | null;
}): string | null {
  const roundIndex = resolveDisplayedRoundIndex(game);
  const fromList = game.roundPrizes?.[roundIndex - 1];
  if (fromList != null && String(fromList).trim() !== "") {
    return String(fromList);
  }
  if (game.roundPrizeAmount != null && String(game.roundPrizeAmount).trim() !== "") {
    return String(game.roundPrizeAmount);
  }
  return game.fixedPrizeAmount ?? game.prizeAmount ?? null;
}

function resolveLivePrizePoolAmount(game: {
  category?: GameOperationItem["category"];
  isChainGame?: boolean | null;
  roundIndex?: number | null;
  currentRound?: number | null;
  roundPrizes?: string[] | null;
  roundPrizeAmount?: string | null;
  fixedPrizeAmount?: string | null;
  prizeAmount?: string | null;
}): string {
  if (isChainGameOperationItem(game)) {
    return resolveCurrentRoundPrize(game) ?? game.prizeAmount ?? "0";
  }
  return game.prizeAmount ?? "0";
}

function resolveCompanyFeePerCartela(game: GameOperationItem): string {
  if (game.companyFeePerCartela) {
    return game.companyFeePerCartela;
  }

  const entry = Number(game.entryFee);
  const prize = Number(game.prizePerCartela);
  if (!Number.isFinite(entry) || !Number.isFinite(prize)) {
    return "0";
  }

  const commission = entry - prize;
  return commission >= 0
    ? commission.toFixed(2).replace(/\.00$/, "")
    : "0";
}

const FALLBACK_NORMAL_ENTRY_FEE = "10";
const FALLBACK_NORMAL_COMMISSION = "2";

function resolveNormalEconomicsFromTimeConfig(
  timeConfig:
    | {
        normalDefaultEntryFee?: string;
        normalDefaultCompanyFeePerCartela?: string;
      }
    | null
    | undefined,
) {
  const entryFee = timeConfig?.normalDefaultEntryFee ?? FALLBACK_NORMAL_ENTRY_FEE;
  const companyFeePerCartela =
    timeConfig?.normalDefaultCompanyFeePerCartela ?? FALLBACK_NORMAL_COMMISSION;

  return {
    entryFee,
    companyFeePerCartela,
    prizePerCartela: computePrizePerCartelaFromEconomics(
      entryFee,
      companyFeePerCartela,
    ),
  };
}

function validateNormalEconomicsDraft(
  entryFee: string,
  companyFeePerCartela: string,
): string | null {
  const entryRaw = entryFee.trim();
  const commissionRaw = companyFeePerCartela.trim();

  if (!entryRaw || !commissionRaw) {
    return "Entry fee and commission are required.";
  }

  if (!/^\d+(\.\d{1,2})?$/.test(entryRaw)) {
    return "Entry fee must be a valid amount.";
  }

  if (!/^\d+(\.\d{1,2})?$/.test(commissionRaw)) {
    return "Commission must be a valid amount.";
  }

  const entry = Number(entryRaw);
  const commission = Number(commissionRaw);

  if (entry < 1 || entry > 999) {
    return "Entry fee must be between 1 and 999 ETB.";
  }

  if (commission < 0) {
    return "Commission must be at least 0 ETB.";
  }

  if (entry - commission < 1) {
    return "Prize per cartela must be at least 1 ETB.";
  }

  return null;
}

type CreateGameMutationVariables = {
  payload: CreateGamePayload;
  normalEconomics?: {
    entryFee: string;
    companyFeePerCartela: string;
    baselineEntryFee: string;
    baselineCompanyFeePerCartela: string;
  };
};

/** Full-card tint for Bonus / Big GOTD (not just the badge). */
function getCategorySurfaceClassName(
  item:
    | Pick<GameOperationItem, "category" | "isBonus">
    | null
    | undefined,
): string | undefined {
  if (!item) return undefined;
  if (isBonusOperationItem(item)) {
    return "border-amber-300 bg-amber-50 text-amber-950";
  }
  if (isBigGotdOperationItem(item)) {
    return "border-yellow-300 bg-yellow-50 text-yellow-950";
  }
  return undefined;
}
import {
  bingoClaimsQueryKey,
  bigGameQueryKey,
  calledNumbersQueryKey,
  type CalledNumbersCache,
  createOptimisticCalledNumber,
  dedupeOperationQueue,
  getOperationItemKey,
  isTerminalGameStatus,
  logCalledNumberEvent,
  mergeCalledNumbersResponse,
  operationsQueryKey,
  patchBigGameFromRegistration,
  patchBigGameStatusFromSocket,
  payloadTouchesCachedBigGame,
  handleTerminalGameEvent,
  patchOperationsForRegistration,
  patchOperationsForStatusChanged,
  patchOperationsForWinnerWindow,
  patchOperationsForChainRound,
  patchOperationsFromCanonicalEvent,
  refetchCalledNumbersForSession,
  optimisticallyClearWaitingQueue,
  optimisticallyPatchEntryFee,
  optimisticallyRemoveBingoClaim,
  optimisticallyReorderQueue,
  applyRealtimeCalledNumber,
  patchOperationsCache,
  readLiveCalledNumbers,
  setAdminOperationsQueryData,
  normalizeAdminOperationsSnapshot,
} from "@/lib/admin/game-operations-cache";
import {
  createCurrentGameOperationsQueryOptions,
  getLastCurrentGameOperationsRefreshAt,
  getOperationsFallbackPollingMs,
  isCurrentGameOperationsFetching,
  isCurrentGameOperationsStale,
  refreshCurrentGameOperations,
  shouldRefreshCurrentGameOperationsOnResume,
} from "@/lib/admin/current-game-operations";
import {
  registerGameOperationsRealtimeListeners,
  resolveNumberCalledRealtimeDecision,
  resolveStructuralRefreshDecision,
} from "@/lib/admin/game-operations-realtime";
import { createOperationsFallbackController } from "@/lib/admin/operations-fallback-controller";
import {
  addWinnerWindowPreviewCartela,
  clearWinnerWindowPreviewSession,
  extractWinnerWindowPreviewCartela,
  resolveWinnerWindowDisplay,
  type WinnerWindowPreviewBySession,
} from "@/lib/admin/winner-window-preview";
import { adminToast } from "@/lib/admin/admin-toast";
import { socketService } from "@/lib/socket/socket-service";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FALLBACK_OPERATIONS_INVALIDATE_DEBOUNCE_MS = 2500;
const timeConfigQueryKey = ["admin", "time-config"] as const;

function logAdminGamesDebug(label: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.info(`[admin-games][page] ${label}`, payload);
}

export function GameOperations() {
  const queryClient = useQueryClient();
  const [selectedGameForEdit, setSelectedGameForEdit] = useState<string | null>(
    null,
  );
  const [entryFeeDrafts, setEntryFeeDrafts] = useState<Record<string, string>>(
    {},
  );
  const [entryFeeError, setEntryFeeError] = useState<string | null>(null);
  const [isCreateGameModalOpen, setIsCreateGameModalOpen] = useState(false);
  const [selectedRuleId, setSelectedRuleId] = useState("");
  const [createGameCategory, setCreateGameCategory] =
    useState<GameCategory>("NORMAL");
  const [bonusFixedPrizeAmount, setBonusFixedPrizeAmount] = useState("");
  const [bonusMaxCartelasPerPlayer, setBonusMaxCartelasPerPlayer] =
    useState("5");
  const [bigGotdEntryFee, setBigGotdEntryFee] = useState("");
  const [bigGameEntryFee, setBigGameEntryFee] = useState("");
  const [bigGameFixedPrizeAmount, setBigGameFixedPrizeAmount] = useState("");
  const [bigGameRegistrationOpensAt, setBigGameRegistrationOpensAt] =
    useState("");
  const [bigGamePlayStartAt, setBigGamePlayStartAt] = useState("");
  const [bigGameRoundCount, setBigGameRoundCount] = useState("1");
  const [bigGameRoundPrizes, setBigGameRoundPrizes] = useState<string[]>([""]);
  const [bigGameRoundRuleIds, setBigGameRoundRuleIds] = useState<string[]>([]);
  const [chainGameEntryFee, setChainGameEntryFee] = useState("");
  const [chainGameFixedPrizeAmount, setChainGameFixedPrizeAmount] =
    useState("");
  const [chainGameMaxCartelasPerPlayer, setChainGameMaxCartelasPerPlayer] =
    useState("5");
  const [chainGameRoundCount, setChainGameRoundCount] = useState(
    String(CHAIN_GAME_MIN_ROUND_COUNT),
  );
  const [chainGameRoundPrizes, setChainGameRoundPrizes] = useState<string[]>(
    Array.from({ length: CHAIN_GAME_MIN_ROUND_COUNT }, () => ""),
  );
  const [chainGameRoundRuleIds, setChainGameRoundRuleIds] = useState<string[]>(
    [],
  );
  const [
    chainGameInterRoundDelaySeconds,
    setChainGameInterRoundDelaySeconds,
  ] = useState(CHAIN_GAME_DEFAULT_INTER_ROUND_DELAY_SECONDS);
  const [forceBigGameEnabled, setForceBigGameEnabled] = useState(false);
  const [forceBigGameCartelaCount, setForceBigGameCartelaCount] = useState("2");
  const [createGameError, setCreateGameError] = useState<string | null>(null);
  const [normalEntryFeeDraft, setNormalEntryFeeDraft] = useState(
    FALLBACK_NORMAL_ENTRY_FEE,
  );
  const [normalCommissionDraft, setNormalCommissionDraft] = useState(
    FALLBACK_NORMAL_COMMISSION,
  );
  const [normalMaxCartelasPerPlayer, setNormalMaxCartelasPerPlayer] =
    useState("");
  const normalEconomicsInitializedRef = useRef(false);
  const [defaultOperationMode, setDefaultOperationMode] =
    useState<GameOperationMode>("MANUAL");
  const [pendingOperationModeSwitch, setPendingOperationModeSwitch] = useState<{
    mode: GameOperationMode;
    slotId: string;
    game: NonNullable<ReturnType<typeof getFocusedGameForModeSwitch>>;
  } | null>(null);

  // Call Number Modal State
  const [isCallNumberModalOpen, setIsCallNumberModalOpen] = useState(false);
  const [callNumberForm, setCallNumberForm] = useState<CallNumberPayload>({
    letter: "B",
    number: 1,
  });
  const [callNumberError, setCallNumberError] = useState<string | null>(null);
  const [cancelLiveOpen, setCancelLiveOpen] = useState(false);
  const [queuedSlotAction, setQueuedSlotAction] = useState<{
    slotId: string;
    label: string;
    mode: "clear" | "cancel";
    registeredCartelasCount?: number;
  } | null>(null);
  const [bigGameScheduleEditing, setBigGameScheduleEditing] = useState(false);
  const [
    bigGameScheduleRegistrationDraft,
    setBigGameScheduleRegistrationDraft,
  ] = useState("");
  const [bigGameSchedulePlayStartDraft, setBigGameSchedulePlayStartDraft] =
    useState("");
  const [bigGameScheduleError, setBigGameScheduleError] = useState<
    string | null
  >(null);
  const [clearQueueOpen, setClearQueueOpen] = useState(false);
  const [registeredPlayersDialog, setRegisteredPlayersDialog] = useState<{
    sessionId: string;
    label: string;
  } | null>(null);
  const [approveClaimTarget, setApproveClaimTarget] =
    useState<AdminBingoClaim | null>(null);
  const [rejectClaimTarget, setRejectClaimTarget] =
    useState<AdminBingoClaim | null>(null);
  const [reorderAction, setReorderAction] = useState<{
    slotId: string;
    direction: "up" | "down";
  } | null>(null);
  const [socketConnected, setSocketConnected] = useState(
    () => socketService.isConnected,
  );
  const [transitionLocked, setTransitionLocked] = useState(false);
  const [transitionLockSessionId, setTransitionLockSessionId] = useState<
    string | null
  >(null);
  const [transitionLockTargetStatus, setTransitionLockTargetStatus] = useState<
    string | null
  >(null);
  const [calledNumbersRevision, setCalledNumbersRevision] = useState(0);
  const [winnerWindowPreviewBySession, setWinnerWindowPreviewBySession] =
    useState<WinnerWindowPreviewBySession>({});
  const bumpCalledNumbersRevision = useCallback(() => {
    setCalledNumbersRevision((revision) => revision + 1);
  }, []);

  const { data: timeConfig, refetch: refetchTimeConfig } = useQuery({
    queryKey: timeConfigQueryKey,
    queryFn: getAdminTimeConfig,
    staleTime: 30_000,
  });

  const operationsInvalidateDebounceMs =
    timeConfig?.adminRefreshDebounceMs ??
    FALLBACK_OPERATIONS_INVALIDATE_DEBOUNCE_MS;
  const operationsFallbackPollingMs = getOperationsFallbackPollingMs(
    timeConfig?.adminFallbackPollingSeconds,
  );

  // CANONICAL: Use backend's single source of truth endpoint
  // Backend decides which game is live/checking/registration/queue
  const {
    data: operations,
    isLoading,
    error,
    isFetching,
  } = useQuery(createCurrentGameOperationsQueryOptions());

  const { data: scheduledBigGame } = useQuery({
    queryKey: bigGameQueryKey,
    queryFn: getCurrentBigGame,
    // Socket + explicit mutations refresh Big Game. No HTTP polling — that was
    // saturating the API (2–3s queries) and causing 503 / reconnect loops.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    retry: 1,
    placeholderData: keepPreviousData,
  });

  // Extract canonical sections from backend response
  const liveGame = operations?.liveGame;
  const checkingGame = operations?.checkingGame;
  const registrationOpenGame = operations?.registrationOpenGame;
  const bigGameOpsRegistration = isBigGameOperationItem(registrationOpenGame)
    ? registrationOpenGame
    : null;
  const standardRegistrationOpenGame = isBigGameOperationItem(
    registrationOpenGame,
  )
    ? null
    : (registrationOpenGame ?? null);
  const queue = useMemo(() => {
    const rawQueue = (operations?.queue ?? []).filter(
      (item) => !isBigGameOperationItem(item),
    );
    const registrationSlotId = standardRegistrationOpenGame?.slotId;

    return dedupeOperationQueue(
      registrationSlotId
        ? rawQueue.filter((item) => item.slotId !== registrationSlotId)
        : rawQueue,
    );
  }, [operations?.queue, standardRegistrationOpenGame?.slotId]);
  // Big Game finished rounds must not occupy Current Game chrome (backend may
  // briefly re-inject terminal liveGame). Round N+1 READY shows via Big Game card.
  const currentGame = useMemo(() => {
    const raw = liveGame ?? checkingGame ?? null;
    if (
      raw &&
      isBigGameOperationItem(raw) &&
      (raw.playerStatus === "finished" || raw.playerStatus === "cancelled")
    ) {
      return null;
    }
    return raw;
  }, [liveGame, checkingGame]);
  const isWinnerWindow = currentGame?.playerStatus === "winnerWindow";
  const isManualChecking = checkingGame?.gameRule?.key === "MANUAL";
  const [winnerWindowNow, setWinnerWindowNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isWinnerWindow) {
      return;
    }

    const timer = window.setInterval(() => {
      setWinnerWindowNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isWinnerWindow, currentGame?.winnerWindowEndsAt]);

  const chainPausedUntil = isChainGameOperationItem(currentGame)
    ? (currentGame?.roundPausedUntil ?? null)
    : null;
  const [chainPauseNow, setChainPauseNow] = useState(() => Date.now());

  useEffect(() => {
    if (!chainPausedUntil) {
      return;
    }

    setChainPauseNow(Date.now());
    const timer = window.setInterval(() => {
      setChainPauseNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [chainPausedUntil]);

  const chainPauseSecondsRemaining = chainPausedUntil
    ? resolveChainPauseSecondsRemaining(
        { roundPausedUntil: chainPausedUntil },
        chainPauseNow,
      )
    : null;
  const focusedGame = useMemo(
    () =>
      getFocusedGameForModeSwitch({
        liveGame: liveGame ?? null,
        checkingGame: checkingGame ?? null,
        registrationOpenGame: standardRegistrationOpenGame,
      }),
    [liveGame, checkingGame, standardRegistrationOpenGame],
  );
  const headerOperationMode =
    pendingOperationModeSwitch?.mode ??
    focusedGame?.operationMode ??
    defaultOperationMode;
  const operationModeLockReason = getOperationModeLockReason(focusedGame);
  const currentSessionId = currentGame?.sessionId ?? null;
  const liveSessionId = currentSessionId;
  const pollOperationsFallback = !socketConnected;
  const isRateLimited = isApiRateLimitError(error);
  const invalidateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const bigGameInvalidateDebounceRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const liveSessionIdRef = useRef(liveSessionId);
  const previousLiveSessionIdRef = useRef<string | null>(null);
  const previousCurrentSessionIdRef = useRef<string | null>(null);
  const hiddenAtRef = useRef<number | null>(null);
  const disconnectedWhileHiddenRef = useRef(false);
  const queueSectionRef = useRef<HTMLDivElement | null>(null);
  const scrollToQueueAfterCreateRef = useRef(false);
  const lastCreateCategoryRef = useRef<GameCategory>("NORMAL");

  const clearWinnerPreviewSession = useCallback(
    (sessionId: string | null | undefined, reason: string) => {
      if (!sessionId) {
        return;
      }

      setWinnerWindowPreviewBySession((current) => {
        const next = clearWinnerWindowPreviewSession(current, sessionId);
        if (next !== current) {
          logAdminGamesDebug("winner_preview_cleared", { sessionId, reason });
        }
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    logAdminGamesDebug("snapshot", {
      operationsState: operations?.operationsState ?? null,
      liveGame: liveGame
        ? {
            sessionId: liveGame.sessionId,
            slotId: liveGame.slotId,
            rawStatus: liveGame.rawStatus,
            playerStatus: liveGame.playerStatus,
            operationStatus: liveGame.operationStatus,
            playCode: liveGame.playCode,
          }
        : null,
      checkingGame: checkingGame
        ? {
            sessionId: checkingGame.sessionId,
            slotId: checkingGame.slotId,
            rawStatus: checkingGame.rawStatus,
            playerStatus: checkingGame.playerStatus,
            operationStatus: checkingGame.operationStatus,
            playCode: checkingGame.playCode,
          }
        : null,
      currentGame: currentGame
        ? {
            sessionId: currentGame.sessionId,
            slotId: currentGame.slotId,
            rawStatus: currentGame.rawStatus,
            playerStatus: currentGame.playerStatus,
            operationStatus: currentGame.operationStatus,
            playCode: currentGame.playCode,
          }
        : null,
      registrationOpenGame: registrationOpenGame
        ? {
            sessionId: registrationOpenGame.sessionId,
            slotId: registrationOpenGame.slotId,
            rawStatus: registrationOpenGame.rawStatus,
            playerStatus: registrationOpenGame.playerStatus,
            operationStatus: registrationOpenGame.operationStatus,
            playCode: registrationOpenGame.playCode,
          }
        : null,
      queueSize: queue.length,
      socketConnected,
      bigGame: {
        scheduledSessionId: scheduledBigGame?.sessionId ?? null,
        scheduledStatus: scheduledBigGame?.status ?? null,
        scheduledRoundIndex: scheduledBigGame?.roundIndex ?? null,
        registrationOpensAt: scheduledBigGame?.registrationOpensAt ?? null,
        scheduledStartAt: scheduledBigGame?.scheduledStartAt ?? null,
        interRoundDelaySeconds:
          scheduledBigGame?.interRoundDelaySeconds ?? null,
        nextRegSessionId:
          bigGameOpsRegistration?.sessionId ??
          operations?.bigGameNextRegistration?.sessionId ??
          scheduledBigGame?.nextRoundRegistration?.sessionId ??
          null,
        nextRegRoundIndex:
          bigGameOpsRegistration?.roundIndex ??
          operations?.bigGameNextRegistration?.roundIndex ??
          scheduledBigGame?.nextRoundRegistration?.roundIndex ??
          null,
        nextRegOpensAt:
          bigGameOpsRegistration?.registrationOpensAt ??
          operations?.bigGameNextRegistration?.registrationOpensAt ??
          scheduledBigGame?.nextRoundRegistration?.registrationOpensAt ??
          null,
        nextRegPlayStartsAt:
          bigGameOpsRegistration?.scheduledStartAt ??
          operations?.bigGameNextRegistration?.scheduledStartAt ??
          scheduledBigGame?.nextRoundRegistration?.scheduledStartAt ??
          null,
      },
    });
  }, [
    checkingGame,
    currentGame,
    liveGame,
    operations?.bigGameNextRegistration?.registrationOpensAt,
    operations?.bigGameNextRegistration?.roundIndex,
    operations?.bigGameNextRegistration?.scheduledStartAt,
    operations?.bigGameNextRegistration?.sessionId,
    operations?.operationsState,
    queue.length,
    registrationOpenGame,
    bigGameOpsRegistration?.sessionId,
    bigGameOpsRegistration?.roundIndex,
    scheduledBigGame?.interRoundDelaySeconds,
    scheduledBigGame?.nextRoundRegistration?.registrationOpensAt,
    scheduledBigGame?.nextRoundRegistration?.roundIndex,
    scheduledBigGame?.nextRoundRegistration?.scheduledStartAt,
    scheduledBigGame?.nextRoundRegistration?.sessionId,
    scheduledBigGame?.registrationOpensAt,
    scheduledBigGame?.roundIndex,
    scheduledBigGame?.scheduledStartAt,
    scheduledBigGame?.sessionId,
    scheduledBigGame?.status,
    socketConnected,
  ]);

  useEffect(() => {
    const previousCurrentSessionId = previousCurrentSessionIdRef.current;
    if (
      previousCurrentSessionId &&
      previousCurrentSessionId !== currentSessionId
    ) {
      clearWinnerPreviewSession(previousCurrentSessionId, "session_changed");
    }

    previousCurrentSessionIdRef.current = currentSessionId;
  }, [clearWinnerPreviewSession, currentSessionId]);

  useEffect(() => {
    if (
      currentSessionId &&
      (currentGame?.winnerPayoutsSummary?.length ?? 0) > 0
    ) {
      clearWinnerPreviewSession(currentSessionId, "canonical_summary_loaded");
    }
  }, [
    clearWinnerPreviewSession,
    currentGame?.winnerPayoutsSummary,
    currentSessionId,
  ]);

  const lockTransitionUi = useCallback(
    (sessionId: string, targetStatus: string) => {
      setTransitionLocked(true);
      setTransitionLockSessionId(sessionId);
      setTransitionLockTargetStatus(targetStatus);
    },
    [],
  );

  const unlockTransitionUi = useCallback(() => {
    setTransitionLocked(false);
    setTransitionLockSessionId(null);
    setTransitionLockTargetStatus(null);
  }, []);

  const scheduleOperationsRefresh = useCallback(
    (immediate = false) => {
      if (invalidateDebounceRef.current) {
        clearTimeout(invalidateDebounceRef.current);
        invalidateDebounceRef.current = null;
      }

      const refresh = () => {
        void refreshCurrentGameOperations(queryClient);
        void queryClient.invalidateQueries({ queryKey: bingoClaimsQueryKey });
      };

      if (immediate) {
        refresh();
        return;
      }

      invalidateDebounceRef.current = setTimeout(() => {
        invalidateDebounceRef.current = null;
        refresh();
      }, operationsInvalidateDebounceMs);
    },
    [operationsInvalidateDebounceMs, queryClient],
  );

  /** Rare HTTP refresh for Big Game create / next-round / cancel — not live play. */
  const scheduleBigGameRefresh = useCallback(
    (immediate = false) => {
      if (bigGameInvalidateDebounceRef.current) {
        clearTimeout(bigGameInvalidateDebounceRef.current);
        bigGameInvalidateDebounceRef.current = null;
      }

      const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: bigGameQueryKey });
      };

      if (immediate) {
        refresh();
        return;
      }

      bigGameInvalidateDebounceRef.current = setTimeout(() => {
        bigGameInvalidateDebounceRef.current = null;
        refresh();
      }, operationsInvalidateDebounceMs);
    },
    [operationsInvalidateDebounceMs, queryClient],
  );

  useEffect(() => {
    return socketService.onConnectionChange((connected) => {
      setSocketConnected(connected);

      if (
        !connected &&
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        disconnectedWhileHiddenRef.current = true;
      }
    });
  }, []);

  useEffect(() => {
    liveSessionIdRef.current = liveSessionId;
  }, [liveSessionId]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const controller = createOperationsFallbackController({
      intervalMs: operationsFallbackPollingMs,
      isEnabled: () => pollOperationsFallback,
      isVisible: () => document.visibilityState !== "hidden",
      isFetching: () => isCurrentGameOperationsFetching(queryClient),
      onTick: () => {
        void refreshCurrentGameOperations(queryClient);
      },
      onVisible: () => {
        const hiddenAt = hiddenAtRef.current;
        const hiddenDurationMs =
          hiddenAt == null ? 0 : Date.now() - hiddenAt;
        const shouldRefresh = shouldRefreshCurrentGameOperationsOnResume({
          hiddenDurationMs,
          disconnectedWhileHidden: disconnectedWhileHiddenRef.current,
          isStale: isCurrentGameOperationsStale(queryClient),
          lastRecoveryRefreshAtMs: getLastCurrentGameOperationsRefreshAt(),
        });

        hiddenAtRef.current = null;
        disconnectedWhileHiddenRef.current = false;

        if (shouldRefresh) {
          void refreshCurrentGameOperations(queryClient, { staleOnly: true });
        }
      },
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
      }

      controller.handleVisibilityChange(document.visibilityState !== "hidden");
    };

    controller.sync();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      controller.dispose();
    };
  }, [operationsFallbackPollingMs, pollOperationsFallback, queryClient]);

  const { data: liveCalledNumbersData } = useQuery({
    queryKey: liveSessionId
      ? calledNumbersQueryKey(liveSessionId)
      : ["admin", "called-numbers", "none"],
    queryFn: async () => {
      const server = await getGameCalledNumbers(liveSessionId!);
      const cached = queryClient.getQueryData<CalledNumbersCache>(
        calledNumbersQueryKey(liveSessionId!),
      );

      return mergeCalledNumbersResponse(
        {
          totalCount: server.totalCount,
          calledNumbers: server.calledNumbers,
        },
        cached,
      );
    },
    enabled: !!liveSessionId,
    staleTime: 30_000,
    refetchInterval: pollOperationsFallback
      ? operationsFallbackPollingMs
      : false,
  });

  useEffect(() => {
    if (!liveSessionId) {
      return;
    }

    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated") {
        return;
      }

      const key = event.query.queryKey;
      if (
        key[0] === "admin" &&
        key[1] === "called-numbers" &&
        key[2] === liveSessionId
      ) {
        bumpCalledNumbersRevision();
      }
    });
  }, [liveSessionId, queryClient, bumpCalledNumbersRevision]);

  const liveCalledNumbers = useMemo(
    () => readLiveCalledNumbers(queryClient, liveSessionId),
    [queryClient, liveSessionId, calledNumbersRevision, liveCalledNumbersData],
  );

  const registeredPlayersQuery = useQuery({
    queryKey: [
      "admin",
      "session-registered-players",
      registeredPlayersDialog?.sessionId,
    ],
    queryFn: () =>
      getSessionRegisteredPlayers(registeredPlayersDialog!.sessionId),
    enabled: Boolean(registeredPlayersDialog?.sessionId),
  });

  useEffect(() => {
    if (!liveSessionId || !socketConnected) {
      return;
    }

    const expectedOrder = Math.max(
      currentGame?.calledNumbersCount ?? 0,
      currentGame?.latestCalledNumber?.order ?? 0,
    );
    const cachedOrder =
      liveCalledNumbers.length > 0
        ? Math.max(
            liveCalledNumbers.length,
            liveCalledNumbers.at(-1)?.order ?? 0,
          )
        : 0;

    if (expectedOrder > cachedOrder) {
      refetchCalledNumbersForSession(queryClient, liveSessionId);
    }
  }, [
    currentGame?.calledNumbersCount,
    currentGame?.latestCalledNumber?.order,
    liveCalledNumbers,
    liveSessionId,
    queryClient,
    socketConnected,
  ]);
  const latestCalledNumber = useMemo(() => {
    const lastFromList = liveCalledNumbers.at(-1);
    if (lastFromList) {
      return lastFromList;
    }

    return currentGame?.latestCalledNumber ?? null;
  }, [liveCalledNumbers, currentGame?.latestCalledNumber]);
  const displayCalledNumbers = useMemo((): CalledNumber[] => {
    if (liveCalledNumbers.length > 0) {
      return liveCalledNumbers;
    }

    if (!latestCalledNumber) {
      return [];
    }

    if (
      "gameSessionId" in latestCalledNumber &&
      latestCalledNumber.gameSessionId
    ) {
      return [latestCalledNumber as CalledNumber];
    }

    return [
      {
        id: `latest-${latestCalledNumber.order}`,
        gameSessionId: liveSessionId ?? "",
        letter: latestCalledNumber.letter,
        number: latestCalledNumber.number,
        order: latestCalledNumber.order,
        createdAt: new Date().toISOString(),
      },
    ];
  }, [liveCalledNumbers, latestCalledNumber, liveSessionId]);
  const currentWinnerPreview = useMemo(
    () =>
      currentSessionId == null
        ? []
        : (winnerWindowPreviewBySession[currentSessionId] ?? []),
    [currentSessionId, winnerWindowPreviewBySession],
  );
  const winnerWindowDisplay = useMemo(
    () =>
      resolveWinnerWindowDisplay({
        canonical: currentGame?.winnerPayoutsSummary,
        preview: currentWinnerPreview,
      }),
    [currentGame?.winnerPayoutsSummary, currentWinnerPreview],
  );
  const displayedCalledCount = useMemo(() => {
    if (liveCalledNumbers.length > 0) {
      const latestOrder = liveCalledNumbers.at(-1)?.order ?? 0;
      return Math.max(liveCalledNumbers.length, latestOrder);
    }

    return Math.max(
      currentGame?.calledNumbersCount ?? 0,
      currentGame?.latestCalledNumber?.order ?? 0,
    );
  }, [
    liveCalledNumbers,
    currentGame?.calledNumbersCount,
    currentGame?.latestCalledNumber?.order,
  ]);
  const isAutoCalling = currentGame?.autoCallEnabled ?? false;
  const autoCallIntervalSec = Math.round(
    resolveAutoCallIntervalMs(currentGame ?? {}, timeConfig) / 1000,
  );
  const [autoCallNow, setAutoCallNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isAutoCalling || !currentGame?.nextAutoCallAt) {
      return;
    }

    const timer = window.setInterval(() => {
      setAutoCallNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isAutoCalling, currentGame?.nextAutoCallAt]);

  const nextAutoCallSeconds =
    isAutoCalling && currentGame?.nextAutoCallAt
      ? Math.max(
          0,
          Math.ceil(
            (new Date(currentGame.nextAutoCallAt).getTime() - autoCallNow) /
              1000,
          ),
        )
      : null;
  const nextAutoCallLabel =
    nextAutoCallSeconds === null
      ? "Auto-call on"
      : nextAutoCallSeconds <= 0
        ? "Calling next ball…"
        : `Next ball in ${nextAutoCallSeconds}s`;

  const registrationScheduledStartAt =
    standardRegistrationOpenGame?.scheduledStartAt ?? null;
  const [registrationNow, setRegistrationNow] = useState(() => Date.now());

  useEffect(() => {
    if (!registrationScheduledStartAt) {
      return;
    }

    setRegistrationNow(Date.now());
    const timer = window.setInterval(() => {
      setRegistrationNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [registrationScheduledStartAt]);

  const registrationCloseTime = registrationScheduledStartAt
    ? new Date(registrationScheduledStartAt).getTime()
    : Number.NaN;
  const registrationSecondsLeft = Number.isNaN(registrationCloseTime)
    ? null
    : Math.max(0, Math.ceil((registrationCloseTime - registrationNow) / 1000));

  const showNextRegistration =
    standardRegistrationOpenGame != null &&
    standardRegistrationOpenGame.slotId !== currentGame?.slotId;
  const hasClearableQueue =
    queue.length > 0 ||
    (standardRegistrationOpenGame != null &&
      standardRegistrationOpenGame.slotId !== currentGame?.slotId);
  const hasEmptyRegistration =
    standardRegistrationOpenGame != null &&
    standardRegistrationOpenGame.slotId !== currentGame?.slotId &&
    (standardRegistrationOpenGame.registeredCartelasCount ?? 0) === 0;
  const clearQueueConfirmDescription = hasEmptyRegistration
    ? "This will remove only waiting games. Live games and paid registrations will stay. The empty registration will also be removed."
    : "This will remove only waiting games. Live games and paid registrations will stay.";

  const reorderableSlots = useMemo(() => {
    const slots = dedupeOperationQueue([
      ...(standardRegistrationOpenGame ? [standardRegistrationOpenGame] : []),
      ...queue,
    ]).filter((item) => !isBigGameOperationItem(item));

    return slots.sort(
      (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0),
    );
  }, [standardRegistrationOpenGame, queue]);

  const showScheduledBigGameCard =
    scheduledBigGame != null && !isBigGameOperationItem(currentGame);
  const liveBigGameNextRegistration = useMemo(() => {
    if (bigGameOpsRegistration) {
      return {
        sessionId: bigGameOpsRegistration.sessionId,
        gameSlotId: bigGameOpsRegistration.slotId,
        staticCode: bigGameOpsRegistration.staticCode,
        playCode: bigGameOpsRegistration.playCode,
        name: scheduledBigGame?.name ?? "Big Game",
        status: "READY" as const,
        category: "BIG_GAME" as const,
        entryFee: bigGameOpsRegistration.entryFee ?? scheduledBigGame?.entryFee ?? "0",
        prizeAmount: bigGameOpsRegistration.prizeAmount ?? "0",
        fixedPrizeAmount:
          bigGameOpsRegistration.fixedPrizeAmount ??
          scheduledBigGame?.fixedPrizeAmount ??
          null,
        registeredCartelasCount: bigGameOpsRegistration.registeredCartelasCount,
        registrationOpensAt: bigGameOpsRegistration.registrationOpensAt,
        scheduledStartAt: bigGameOpsRegistration.scheduledStartAt,
        roundCount:
          bigGameOpsRegistration.roundCount ??
          scheduledBigGame?.roundCount ??
          undefined,
        roundIndex: bigGameOpsRegistration.roundIndex,
      };
    }

    if (
      !isBigGameOperationItem(currentGame) ||
      currentGame?.playerStatus === "finished" ||
      currentGame?.playerStatus === "cancelled"
    ) {
      return null;
    }

    return (
      scheduledBigGame?.nextRoundRegistration ??
      (operations?.bigGameNextRegistration
        ? {
            sessionId: operations.bigGameNextRegistration.sessionId,
            gameSlotId: operations.bigGameNextRegistration.slotId,
            staticCode: operations.bigGameNextRegistration.staticCode,
            playCode: operations.bigGameNextRegistration.playCode,
            name: scheduledBigGame?.name ?? "Big Game",
            status: "READY" as const,
            category: "BIG_GAME" as const,
            entryFee: scheduledBigGame?.entryFee ?? "0",
            prizeAmount: "0",
            fixedPrizeAmount: scheduledBigGame?.fixedPrizeAmount ?? null,
            registeredCartelasCount:
              operations.bigGameNextRegistration.registeredCartelasCount,
            registrationOpensAt:
              operations.bigGameNextRegistration.registrationOpensAt,
            scheduledStartAt:
              operations.bigGameNextRegistration.scheduledStartAt,
            roundCount:
              operations.bigGameNextRegistration.roundCount ?? undefined,
            roundIndex: operations.bigGameNextRegistration.roundIndex,
          }
        : null)
    );
  }, [
    bigGameOpsRegistration,
    currentGame,
    operations?.bigGameNextRegistration,
    scheduledBigGame,
  ]);
  const showLiveBigGameNextRegistrationCard =
    liveBigGameNextRegistration != null;
  const hasActiveBigGame =
    scheduledBigGame != null || isBigGameOperationItem(currentGame);

  const { data: gameRules = [] } = useQuery({
    queryKey: ["admin", "game-rules"],
    queryFn: getAdminGameRules,
    enabled: isCreateGameModalOpen,
  });

  const activeGameRules = gameRules.filter((rule) => rule.isActive !== false);

  /**
   * Chain rounds share one board and never clear marks, so an easier pattern in a
   * later round is usually already complete the moment that round starts. Rules are
   * ordered easiest-first by sortOrder, so a drop between rounds is the signal.
   */
  const chainGameEasierPatternWarning = useMemo(() => {
    if (createGameCategory !== "CHAIN_GAME") {
      return null;
    }

    const difficultyByRuleId = new Map(
      activeGameRules.map((rule) => [rule.id, rule.sortOrder ?? 0]),
    );

    for (let index = 1; index < chainGameRoundRuleIds.length; index += 1) {
      const previous = difficultyByRuleId.get(chainGameRoundRuleIds[index - 1]);
      const current = difficultyByRuleId.get(chainGameRoundRuleIds[index]);
      if (previous == null || current == null || current >= previous) {
        continue;
      }
      return `Round ${index + 1}'s pattern looks easier than round ${index}'s. Marked cells carry over between chain rounds, so players may win it instantly. Order rounds from easiest to hardest.`;
    }

    return null;
  }, [createGameCategory, activeGameRules, chainGameRoundRuleIds]);

  useEffect(() => {
    if (!isCreateGameModalOpen) {
      return;
    }

    void refetchTimeConfig();
  }, [isCreateGameModalOpen, refetchTimeConfig]);

  useEffect(() => {
    if (!isCreateGameModalOpen) {
      normalEconomicsInitializedRef.current = false;
      return;
    }

    if (!timeConfig || normalEconomicsInitializedRef.current) {
      return;
    }

    const economics = resolveNormalEconomicsFromTimeConfig(timeConfig);
    setNormalEntryFeeDraft(economics.entryFee);
    setNormalCommissionDraft(economics.companyFeePerCartela);
    normalEconomicsInitializedRef.current = true;
  }, [isCreateGameModalOpen, timeConfig]);

  useEffect(() => {
    if (!isCreateGameModalOpen || activeGameRules.length === 0) {
      return;
    }

    setSelectedRuleId((current) => {
      if (current && activeGameRules.some((rule) => rule.id === current)) {
        return current;
      }

      return activeGameRules[0].id;
    });
  }, [isCreateGameModalOpen, activeGameRules]);

  useEffect(() => {
    if (!scrollToQueueAfterCreateRef.current) {
      return;
    }

    scrollToQueueAfterCreateRef.current = false;
    window.requestAnimationFrame(() => {
      queueSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [
    operations?.timestamp,
    queue.length,
    standardRegistrationOpenGame?.slotId,
  ]);

  // Fetch pending bingo claims for the checking game
  const { data: bingoClaims } = useQuery({
    queryKey: bingoClaimsQueryKey,
    queryFn: async () => {
      const response = await getAdminBingoClaims(1, 10);
      return response.items.filter(
        (c: AdminBingoClaim) => c.status === "PENDING",
      );
    },
    refetchInterval: socketConnected ? false : 5000,
    enabled: !!checkingGame && isManualChecking,
  });

  useEffect(() => {
    if (!liveSessionId) {
      previousLiveSessionIdRef.current = null;
      return;
    }

    if (previousLiveSessionIdRef.current !== liveSessionId) {
      previousLiveSessionIdRef.current = liveSessionId;
      refetchCalledNumbersForSession(queryClient, liveSessionId);
    }
  }, [liveSessionId, queryClient]);

  useEffect(() => {
    const handleNumberCalled = (payload: unknown) => {
      const decision = resolveNumberCalledRealtimeDecision(
        payload,
        liveSessionIdRef.current,
      );

      if (decision.type !== "apply") {
        return;
      }

      logCalledNumberEvent(decision.calledNumber);
      applyRealtimeCalledNumber(
        queryClient,
        decision.calledNumber.gameSessionId,
        decision.calledNumber,
      );

      if (decision.autoCallSchedule) {
        patchOperationsCache(queryClient, {
          sessionId: decision.calledNumber.gameSessionId,
          ...decision.autoCallSchedule,
        });
        setAutoCallNow(Date.now());
      }

      bumpCalledNumbersRevision();
    };

    const handleReconnectRefresh = () => {
      logAdminGamesDebug("socket_connect_refresh", {
        liveSessionId: liveSessionIdRef.current,
      });
      refetchCalledNumbersForSession(queryClient, liveSessionIdRef.current);
      void refreshCurrentGameOperations(queryClient);
      void queryClient.invalidateQueries({ queryKey: bingoClaimsQueryKey });
      // Do not invalidate big-game here — reconnect storms were flooding
      // GET /games/big-game/current and taking the API down.
    };

    const handleOperationUpdated = (payload: unknown) => {
      const decision = resolveStructuralRefreshDecision(payload);
      logAdminGamesDebug("socket_game_operation_updated", {
        decision: decision.type,
        payload,
      });

      if (decision.type === "ignore") {
        return;
      }

      if (decision.type === "patchAutoCall") {
        patchOperationsCache(queryClient, {
          sessionId: decision.patch.sessionId,
          slotId: decision.patch.slotId,
          autoCallEnabled: decision.patch.autoCallEnabled,
          autoCallIntervalMs: decision.patch.autoCallIntervalMs,
          nextAutoCallAt: decision.patch.nextAutoCallAt,
        });
        return;
      }

      if (!patchOperationsFromCanonicalEvent(queryClient, payload)) {
        scheduleOperationsRefresh(true);
      }
    };

    const handleTerminalSession = (payload: unknown) => {
      logAdminGamesDebug("socket_terminal_session", {
        payload,
      });
      if (payload && typeof payload === "object") {
        const data = payload as {
          sessionId?: string | null;
          id?: string | null;
          slotId?: string | null;
          gameSlotId?: string | null;
          status?: string | null;
          reason?: string | null;
        };
        if (
          transitionLocked &&
          transitionLockSessionId &&
          transitionLockTargetStatus &&
          (data.sessionId ?? data.id ?? null) === transitionLockSessionId &&
          (data.status === transitionLockTargetStatus ||
            (transitionLockTargetStatus === "FINISHED" && data.status == null) ||
            (transitionLockTargetStatus === "CANCELLED" && data.reason != null))
        ) {
          unlockTransitionUi();
        }

        if (data.status === "NO_WINNER") {
          adminToast.info(
            "No Winner. All 75 numbers were called. Queue restored / next game pending.",
          );
        }

        // Drop finished round from Current Game immediately, then refetch ops
        // so Round N+1 READY / next live becomes SoT (not stacked finished UI).
        handleTerminalGameEvent(queryClient, {
          sessionId: data.sessionId ?? data.id ?? null,
          slotId: data.slotId ?? data.gameSlotId ?? null,
        });
        clearWinnerPreviewSession(
          data.sessionId ?? data.id ?? null,
          "terminal_event",
        );
      }

      if (payloadTouchesCachedBigGame(queryClient, payload)) {
        patchBigGameStatusFromSocket(queryClient, payload);
        // Next-round READY sessions need a fetch after a round ends.
        scheduleBigGameRefresh(true);
      }
    };

    const handleGameCancelled = (payload: unknown) => {
      if (payload && typeof payload === "object") {
        const data = payload as {
          reason?: string | null;
          refundedCount?: number | null;
        };

        if (data.reason === "no_players") {
          adminToast.info("Skipped — no players joined.");
        } else if (data.reason === "queue_cleared") {
          // Queue clear already shows its own success toast.
        } else {
          const refunded = data.refundedCount ?? 0;
          adminToast.info(
            refunded > 0
              ? `Cancelled — ${refunded} entry fee${refunded === 1 ? "" : "s"} refunded.`
              : "Game cancelled.",
          );
        }
      }

      handleTerminalSession(payload);
    };

    const handleStatusChanged = (payload: unknown) => {
      const status =
        payload && typeof payload === "object"
          ? (payload as { status?: string | null }).status ?? null
          : null;
      const sessionId =
        payload && typeof payload === "object"
          ? ((payload as { sessionId?: string | null; id?: string | null })
              .sessionId ??
            (payload as { id?: string | null }).id ??
            null)
          : null;

      logAdminGamesDebug("socket_status_changed", {
        sessionId,
        status,
        payload,
      });

      if (transitionLocked) {
        if (
          transitionLockSessionId &&
          transitionLockTargetStatus &&
          sessionId === transitionLockSessionId &&
          status === transitionLockTargetStatus
        ) {
          unlockTransitionUi();
        } else {
          // Ignore stale status events that do not match the pending transition.
        }
      }

      if (isTerminalGameStatus(status)) {
        handleTerminalSession(payload);
        return;
      }

      if (!patchOperationsForStatusChanged(queryClient, payload)) {
        scheduleOperationsRefresh(true);
      }

      if (payloadTouchesCachedBigGame(queryClient, payload)) {
        if (!patchBigGameStatusFromSocket(queryClient, payload)) {
          scheduleBigGameRefresh(false);
        }
      }
    };

    const handleWinnerWindow = (payload: unknown) => {
      logAdminGamesDebug("socket_winner_window", { payload });
      const previewCartela = extractWinnerWindowPreviewCartela(payload);
      if (previewCartela) {
        setWinnerWindowPreviewBySession((current) => {
          const next = addWinnerWindowPreviewCartela(current, previewCartela);
          if (next !== current) {
            logAdminGamesDebug("winner_preview_added", {
              sessionId: previewCartela.sessionId,
              cartelaNumber: previewCartela.cartelaNumber,
              claimId: previewCartela.claimId ?? null,
              gameCartelaId: previewCartela.gameCartelaId ?? null,
            });
          }
          return next;
        });
      }
      if (!patchOperationsForWinnerWindow(queryClient, payload)) {
        scheduleOperationsRefresh(true);
      }
      if (payloadTouchesCachedBigGame(queryClient, payload)) {
        if (!patchBigGameStatusFromSocket(queryClient, payload)) {
          scheduleBigGameRefresh(false);
        }
      }
    };

    const handleRegistrationMetrics = (payload: unknown) => {
      logAdminGamesDebug("socket_registration_metrics", { payload });
      if (!patchOperationsForRegistration(queryClient, payload)) {
        scheduleOperationsRefresh(true);
      }
      patchBigGameFromRegistration(queryClient, payload);
    };

    const handleSlotUpdate = (payload: unknown) => {
      logAdminGamesDebug("socket_slot_update", { payload });
      if (!patchOperationsFromCanonicalEvent(queryClient, payload)) {
        scheduleOperationsRefresh(true);
      }
      if (payloadTouchesCachedBigGame(queryClient, payload)) {
        scheduleBigGameRefresh(false);
      }
    };

    const handleBingoClaimed = () => {
      void queryClient.invalidateQueries({ queryKey: bingoClaimsQueryKey });
    };

    const handleChainRound = (payload: unknown) => {
      logAdminGamesDebug("socket_chain_round", { payload });
      if (!patchOperationsForChainRound(queryClient, payload)) {
        scheduleOperationsRefresh(true);
      }
    };

    const cleanupRealtimeListeners = registerGameOperationsRealtimeListeners(
      socketService,
      {
        connect: handleReconnectRefresh,
        gameStatusChanged: handleStatusChanged,
        gameOperationUpdated: handleOperationUpdated,
        gameNumberCalled: handleNumberCalled,
        gameBingoClaimed: handleBingoClaimed,
        gameWinnerWindowStarted: handleWinnerWindow,
        gameWinnerWindowJoined: handleWinnerWindow,
        gameFinished: handleTerminalSession,
        gameCancelled: handleGameCancelled,
        chainRoundFinished: handleChainRound,
        chainRoundStarted: handleChainRound,
        sessionPrizeUpdated: handleRegistrationMetrics,
        sessionCartelasUpdated: handleRegistrationMetrics,
        slotStatusChanged: handleSlotUpdate,
        slotEntryFeeUpdated: handleSlotUpdate,
      },
    );

    return () => {
      if (invalidateDebounceRef.current) {
        clearTimeout(invalidateDebounceRef.current);
      }
      if (bigGameInvalidateDebounceRef.current) {
        clearTimeout(bigGameInvalidateDebounceRef.current);
      }

      cleanupRealtimeListeners();
    };
  }, [
    queryClient,
    bumpCalledNumbersRevision,
    scheduleOperationsRefresh,
    scheduleBigGameRefresh,
    socketConnected,
    transitionLocked,
    transitionLockSessionId,
    transitionLockTargetStatus,
    unlockTransitionUi,
  ]);

  useEffect(() => {
    setDefaultOperationMode(
      readStoredDefaultOperationMode(window.localStorage),
    );
  }, []);

  const openCreateGameModal = () => {
    setCreateGameError(null);
    setIsCreateGameModalOpen(true);
  };

  const commitDefaultOperationMode = (mode: GameOperationMode) => {
    setDefaultOperationMode(mode);
    writeStoredDefaultOperationMode(window.localStorage, mode);
  };

  const handleDefaultOperationModeChange = (mode: GameOperationMode) => {
    if (mode === headerOperationMode) {
      return;
    }

    if (operationModeLockReason) {
      return;
    }

    if (focusedGame) {
      if (shouldPromptApplyModeToCurrentGame(focusedGame, mode)) {
        setPendingOperationModeSwitch({
          mode,
          slotId: focusedGame.slotId,
          game: focusedGame,
        });
        return;
      }

      return;
    }

    commitDefaultOperationMode(mode);
  };

  const applyOperationModeToCurrentGame = useAdminMutation({
    mutationFn: ({
      slotId,
      game,
      mode,
    }: {
      slotId: string;
      game: GameOperationItem;
      mode: GameOperationMode;
    }) =>
      updateAdminSlotOperationMode(
        slotId,
        buildOperationModeSwitchPayload(game, mode, timeConfig),
      ),
    successMessage: "Operation mode updated for current game.",
    errorMessage: "Could not update operation mode for the current game.",
    invalidateQueryKeys: [],
    onSuccess: (_data, variables) => {
      commitDefaultOperationMode(variables.mode);
      setPendingOperationModeSwitch(null);
      scheduleOperationsRefresh(true);
    },
  });

  const createGame = useAdminMutation({
    mutationFn: async ({ payload, normalEconomics }: CreateGameMutationVariables) => {
      if (normalEconomics) {
        const entryFee = normalEconomics.entryFee.trim();
        const companyFeePerCartela = normalEconomics.companyFeePerCartela.trim();
        const economicsChanged =
          entryFee !== normalEconomics.baselineEntryFee.trim() ||
          companyFeePerCartela !==
            normalEconomics.baselineCompanyFeePerCartela.trim();

        if (economicsChanged) {
          const updatedTimeConfig = await updateAdminTimeConfig({
            normalDefaultEntryFee: entryFee,
            normalDefaultCompanyFeePerCartela: companyFeePerCartela,
          });
          queryClient.setQueryData(timeConfigQueryKey, updatedTimeConfig);
        }
      }

      return createAdminGame(buildCreateGameRequestBody(payload));
    },
    errorMessage: "Could not add the game to the queue.",
    invalidateQueryKeys: [],
    onSuccess: (data) => {
      setIsCreateGameModalOpen(false);
      setCreateGameError(null);
      if (lastCreateCategoryRef.current === "BIG_GAME") {
        adminToast.success("Big Game scheduled.");
      } else {
        adminToast.success("Game added to queue.");
        scrollToQueueAfterCreateRef.current = true;
      }
      if (data.operations) {
        setAdminOperationsQueryData(queryClient, data.operations);
      }
      void queryClient.invalidateQueries({ queryKey: timeConfigQueryKey });
      scheduleOperationsRefresh(true);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.statusCode === 409) {
        setCreateGameError("A Big Game is already scheduled.");
        return;
      }

      setCreateGameError(
        getApiErrorMessage(error, "Could not add the game to the queue."),
      );
    },
  });

  const startGame = useAdminMutation({
    mutationFn: (gameId: string) => startAdminGame(gameId),
    successMessage: undefined,
    errorMessage: "Failed to start game.",
    invalidateQueryKeys: [],
    onSuccess: (data) => {
      setAdminOperationsQueryData(queryClient, data.operations);
      const liveStatus =
        normalizeAdminOperationsSnapshot(data.operations).liveGame
          ?.playerStatus ?? null;
      if (liveStatus === "playing") {
        unlockTransitionUi();
      }
    },
    onError: () => {
      unlockTransitionUi();
    },
  });

  const cancelLiveSession = useAdminMutation({
    mutationFn: (sessionId: string) => cancelBlockingSession(sessionId),
    errorMessage: "Failed to cancel live game.",
    invalidateQueryKeys: [],
    onSuccess: (data) => {
      const normalized = normalizeAdminOperationsSnapshot(data.operations);
      setAdminOperationsQueryData(queryClient, data.operations);
      const currentStatus =
        normalized.liveGame?.playerStatus ??
        normalized.checkingGame?.playerStatus ??
        null;
      if (currentStatus !== "playing" && currentStatus !== "checking") {
        unlockTransitionUi();
      }
    },
    onError: () => {
      unlockTransitionUi();
    },
  });

  const finishWinnerWindow = useAdminMutation({
    mutationFn: (sessionId: string) => finishWinnerWindowCommand(sessionId),
    successMessage: undefined,
    errorMessage: "Failed to finish winner window.",
    invalidateQueryKeys: [],
    onSuccess: (data) => {
      // Drop finished Big Game from Current Game; promote Round N+1 via Big Game cache.
      setAdminOperationsQueryData(queryClient, data.operations);
      const normalized = normalizeAdminOperationsSnapshot(data.operations);
      const liveStatus = normalized.liveGame?.playerStatus ?? null;
      if (liveStatus !== "winnerWindow") {
        unlockTransitionUi();
      }
      void queryClient.invalidateQueries({ queryKey: bigGameQueryKey });
      scheduleOperationsRefresh(true);
    },
    onError: () => {
      unlockTransitionUi();
    },
  });

  const continueChainRoundNow = useAdminMutation({
    mutationFn: (slotId: string) => continueAdminChainRoundNow(slotId),
    successMessage: "Next round resumed.",
    errorMessage: "Failed to resume the next round.",
    invalidateQueryKeys: [],
    onSuccess: () => {
      void refreshCurrentGameOperations(queryClient);
    },
  });

  const extendChainRoundPause = useAdminMutation({
    mutationFn: (slotId: string) =>
      extendAdminChainRoundPause(slotId, CHAIN_GAME_PAUSE_EXTENSION_SECONDS),
    successMessage: `Winner reveal extended by ${CHAIN_GAME_PAUSE_EXTENSION_SECONDS}s.`,
    errorMessage: "Failed to extend the winner reveal.",
    invalidateQueryKeys: [],
    onSuccess: () => {
      void refreshCurrentGameOperations(queryClient);
    },
  });

  const removeQueuedSlot = useAdminMutation({
    mutationFn: (slotId: string) =>
      updateAdminGameStatus(slotId, { status: "CANCELLED" }),
    successMessage:
      queuedSlotAction?.mode === "clear"
        ? "Game removed from queue."
        : "Game cancelled.",
    errorMessage:
      queuedSlotAction?.mode === "clear"
        ? "Failed to remove game from queue."
        : "Failed to cancel game.",
    invalidateQueryKeys: [],
    onSuccess: () => {
      setQueuedSlotAction(null);
      void queryClient.invalidateQueries({ queryKey: bigGameQueryKey });
      scheduleOperationsRefresh(true);
    },
  });

  const updateBigGameSchedule = useAdminMutation({
    mutationFn: ({
      slotId,
      registrationOpensAt,
      playStartAt,
    }: {
      slotId: string;
      registrationOpensAt: string;
      playStartAt: string;
    }) =>
      updateAdminBigGameSchedule(slotId, {
        registrationOpensAt,
        playStartAt,
      }),
    successMessage: "Big Game schedule updated.",
    errorMessage: "Could not update the Big Game schedule.",
    invalidateQueryKeys: [],
    onSuccess: () => {
      setBigGameScheduleEditing(false);
      setBigGameScheduleError(null);
      void queryClient.invalidateQueries({ queryKey: bigGameQueryKey });
      scheduleOperationsRefresh(true);
    },
    onError: (error) => {
      setBigGameScheduleError(
        getApiErrorMessage(error, "Could not update the Big Game schedule."),
      );
    },
  });

  const startBigGameNextRound = useAdminMutation({
    mutationFn: (slotId: string) => startAdminBigGameNextRound(slotId),
    successMessage: "Next Big Game round started.",
    errorMessage: "Could not start the next Big Game round.",
    invalidateQueryKeys: [],
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bigGameQueryKey });
      scheduleOperationsRefresh(true);
    },
  });

  const startBigGameNow = useAdminMutation({
    mutationFn: (slotId: string) => startAdminBigGameNow(slotId),
    successMessage: "Big Game started.",
    errorMessage: "Could not start the Big Game.",
    invalidateQueryKeys: [],
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bigGameQueryKey });
      scheduleOperationsRefresh(true);
    },
  });

  const callNumber = useAdminMutation({
    mutationFn: ({
      sessionId,
      payload,
    }: {
      sessionId: string;
      payload: CallNumberPayload;
    }) => callAdminGameNumber(sessionId, payload),
    successMessage: "Number called.",
    errorMessage: "Failed to call number.",
    invalidateQueryKeys: [],
    onMutate: async ({ sessionId, payload }) => {
      await queryClient.cancelQueries({ queryKey: operationsQueryKey });

      const previousOperations =
        queryClient.getQueryData<GameOperationsCurrentResponse>(
          operationsQueryKey,
        );
      const previousCalledNumbers = liveSessionId
        ? queryClient.getQueryData(calledNumbersQueryKey(liveSessionId))
        : undefined;
      const nextOrder =
        (liveCalledNumbers.length || currentGame?.calledNumbersCount || 0) + 1;
      const optimisticCalledNumber = createOptimisticCalledNumber(
        sessionId,
        payload,
        nextOrder,
      );

      applyRealtimeCalledNumber(queryClient, sessionId, optimisticCalledNumber);
      bumpCalledNumbersRevision();

      return { previousOperations, previousCalledNumbers, liveSessionId };
    },
    onSuccess: () => {
      setCallNumberError(null);
      scheduleOperationsRefresh(false);
    },
    onError: (error, _variables, context) => {
      if (context?.previousOperations) {
        queryClient.setQueryData(
          operationsQueryKey,
          context.previousOperations,
        );
      }

      if (context?.liveSessionId && context.previousCalledNumbers) {
        queryClient.setQueryData(
          calledNumbersQueryKey(context.liveSessionId),
          context.previousCalledNumbers,
        );
      }

      setCallNumberError(getApiErrorMessage(error, "Failed to call number"));
    },
  });

  const startAutoCall = useAdminMutation({
    mutationFn: (sessionId: string) => startSessionAutoCall(sessionId),
    successMessage: "Auto-call started.",
    errorMessage: "Failed to start auto-call.",
    invalidateQueryKeys: [],
    onMutate: (sessionId) => {
      patchOperationsCache(queryClient, {
        sessionId,
        autoCallEnabled: true,
        updatedReason: "auto_call_changed",
      });
    },
    onSuccess: () => {
      setCallNumberError(null);
      scheduleOperationsRefresh(true);
    },
    onError: (error) => {
      setCallNumberError(
        getApiErrorMessage(error, "Failed to start auto-call"),
      );
    },
  });

  const stopAutoCall = useAdminMutation({
    mutationFn: (sessionId: string) => stopSessionAutoCall(sessionId),
    successMessage: "Auto-call stopped.",
    errorMessage: "Failed to stop auto-call.",
    invalidateQueryKeys: [],
    onMutate: (sessionId) => {
      patchOperationsCache(queryClient, {
        sessionId,
        autoCallEnabled: false,
        updatedReason: "auto_call_changed",
      });
    },
    onSuccess: () => {
      setCallNumberError(null);
      scheduleOperationsRefresh(true);
    },
    onError: (error) => {
      setCallNumberError(getApiErrorMessage(error, "Failed to stop auto-call"));
    },
  });

  const approveClaim = useAdminMutation({
    mutationFn: approveAdminBingoClaim,
    successMessage: "Bingo claim approved.",
    errorMessage: "Failed to approve bingo claim.",
    invalidateQueryKeys: [],
    onMutate: (claimId) => ({
      previousClaims: optimisticallyRemoveBingoClaim(queryClient, claimId),
    }),
    onSuccess: () => {
      setApproveClaimTarget(null);
      scheduleOperationsRefresh(true);
    },
    onError: (_error, claimId, context) => {
      if (context?.previousClaims) {
        queryClient.setQueryData(bingoClaimsQueryKey, context.previousClaims);
      }
    },
  });

  const rejectClaim = useAdminMutation({
    mutationFn: ({ claimId, reason }: { claimId: string; reason: string }) =>
      rejectAdminBingoClaim(claimId, reason),
    successMessage: "Bingo claim rejected.",
    errorMessage: "Failed to reject bingo claim.",
    invalidateQueryKeys: [],
    onMutate: ({ claimId }) => ({
      previousClaims: optimisticallyRemoveBingoClaim(queryClient, claimId),
    }),
    onSuccess: () => {
      setRejectClaimTarget(null);
      scheduleOperationsRefresh(true);
    },
    onError: (_error, _variables, context) => {
      if (context?.previousClaims) {
        queryClient.setQueryData(bingoClaimsQueryKey, context.previousClaims);
      }
    },
  });

  const updateEntryFee = useAdminMutation({
    mutationFn: ({ gameId, entryFee }: { gameId: string; entryFee: string }) =>
      updateAdminSlotEntryFee(gameId, entryFee),
    successMessage: "Entry fee updated.",
    errorMessage: "Could not update the entry fee.",
    invalidateQueryKeys: [],
    onMutate: ({ gameId, entryFee }) => ({
      previousOperations: optimisticallyPatchEntryFee(
        queryClient,
        gameId,
        entryFee,
      ),
    }),
    onSuccess: (_, { gameId }) => {
      setSelectedGameForEdit(null);
      setEntryFeeError(null);
      setEntryFeeDrafts((current) => {
        const next = { ...current };
        delete next[gameId];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: bigGameQueryKey });
      scheduleOperationsRefresh(true);
    },
    onError: (error, _variables, context) => {
      if (context?.previousOperations) {
        queryClient.setQueryData(
          operationsQueryKey,
          context.previousOperations,
        );
      }

      setEntryFeeError(
        getApiErrorMessage(error, "Could not update the entry fee."),
      );
    },
  });

  const reorderSlots = useAdminMutation({
    mutationFn: reorderAdminSlots,
    successMessage: "Queue order updated.",
    errorMessage: "Failed to reorder queue.",
    invalidateQueryKeys: [],
    onMutate: (slotIds) => ({
      previousOperations: optimisticallyReorderQueue(queryClient, slotIds),
    }),
    onSuccess: () => {
      scheduleOperationsRefresh(true);
    },
    onError: (_error, _variables, context) => {
      if (context?.previousOperations) {
        queryClient.setQueryData(
          operationsQueryKey,
          context.previousOperations,
        );
      }
    },
    onSettled: () => {
      setReorderAction(null);
    },
  });

  const clearQueue = useAdminMutation({
    mutationFn: clearAdminQueue,
    invalidateQueryKeys: [],
    onSuccess: (result) => {
      setClearQueueOpen(false);
      if (result.operations) {
        setAdminOperationsQueryData(queryClient, result.operations);
      } else {
        optimisticallyClearWaitingQueue(queryClient, {
          keptRegistration: result.keptRegistration,
          cancelledEmptyRegistration: result.cancelledEmptyRegistration,
        });
      }
      adminToast.success(
        result.keptRegistration
          ? "Waiting queue cleared. Current registration kept."
          : "Waiting queue cleared.",
      );
      scheduleOperationsRefresh(true);
    },
    onError: (error) => {
      adminToast.error(getApiErrorMessage(error, "Failed to clear queue."));
    },
  });

  const handleReorder = (slotId: string, direction: "up" | "down") => {
    if (reorderSlots.isPending) {
      return;
    }

    const slotIds = reorderableSlots.map((slot) => slot.slotId);
    const currentIndex = slotIds.indexOf(slotId);
    if (currentIndex === -1) return;

    const targetIndex =
      direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= slotIds.length) return;

    const nextOrder = [...slotIds];
    [nextOrder[currentIndex], nextOrder[targetIndex]] = [
      nextOrder[targetIndex],
      nextOrder[currentIndex],
    ];
    setReorderAction({ slotId, direction });
    reorderSlots.mutate(nextOrder);
  };

  const canEditEntryFee = (registeredCartelasCount: number) =>
    registeredCartelasCount === 0;

  const saveEntryFee = (slotId: string, registeredCartelasCount: number) => {
    if (!canEditEntryFee(registeredCartelasCount)) {
      setEntryFeeError("Entry fee is locked after the first registration.");
      return;
    }

    const draft = entryFeeDrafts[slotId];
    if (!draft || Number(draft) < 8) {
      setEntryFeeError("Entry fee must be at least 8 ETB.");
      return;
    }

    updateEntryFee.mutate({ gameId: slotId, entryFee: draft });
  };

  const startEntryFeeEdit = (
    slotId: string,
    currentFee: string,
    registeredCartelasCount: number,
  ) => {
    if (!canEditEntryFee(registeredCartelasCount)) {
      return;
    }

    setEntryFeeError(null);
    setSelectedGameForEdit(slotId);
    setEntryFeeDrafts((current) => ({
      ...current,
      [slotId]: currentFee,
    }));
  };

  const startBigGameScheduleEdit = () => {
    if (!scheduledBigGame) {
      return;
    }

    setBigGameScheduleError(null);
    setBigGameScheduleEditing(true);
    setBigGameScheduleRegistrationDraft(
      isoToDatetimeLocal(scheduledBigGame.registrationOpensAt),
    );
    setBigGameSchedulePlayStartDraft(
      isoToDatetimeLocal(scheduledBigGame.scheduledStartAt),
    );
  };

  const saveBigGameSchedule = (slotId: string) => {
    const registrationOpensAt = datetimeLocalToIso(
      bigGameScheduleRegistrationDraft,
    );
    const playStartAt = datetimeLocalToIso(bigGameSchedulePlayStartDraft);

    if (!registrationOpensAt || !playStartAt) {
      setBigGameScheduleError("Both schedule times are required.");
      return;
    }

    const orderError = validateBigGameScheduleOrder(
      registrationOpensAt,
      playStartAt,
    );
    if (orderError) {
      setBigGameScheduleError(orderError);
      return;
    }

    updateBigGameSchedule.mutate({
      slotId,
      registrationOpensAt,
      playStartAt,
    });
  };

  if (isLoading && !operations) {
    return <GameOperationsSkeleton />;
  }

  if (error && !operations && !isRateLimited) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        <p className="font-medium">Failed to load game operations</p>
        <p className="text-sm">{getApiErrorMessage(error)}</p>
        <Button
          onClick={() => void refreshCurrentGameOperations(queryClient)}
          className="mt-2"
          variant="outline"
          size="sm"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (error && !operations && isRateLimited) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Game operations sync is temporarily paused. Please wait a moment and
          refresh.
        </div>
        <Button
          onClick={() => void refreshCurrentGameOperations(queryClient)}
          variant="outline"
          size="sm"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
          <OperationModeHeaderControl
            value={headerOperationMode}
            onChange={handleDefaultOperationModeChange}
            isLoading={
              applyOperationModeToCurrentGame.isPending ||
              Boolean(operationModeLockReason)
            }
            focusedGameLabel={
              operationModeLockReason ??
              focusedGame?.playCode ??
              focusedGame?.staticCode ??
              null
            }
          />
          <Button onClick={openCreateGameModal} className="shrink-0 self-start">
            <Plus className="mr-2 h-4 w-4" />
            Add Game to Queue
          </Button>
        </div>
      </div>

      {isRateLimited ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Sync paused briefly. Showing the last loaded game state
          {isFetching ? " while retrying…" : "."}
        </div>
      ) : null}

      {!socketConnected ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Reconnecting…
        </div>
      ) : null}

      {operations?.operationsState === "handoff" &&
      queue.length > 0 &&
      !standardRegistrationOpenGame &&
      !currentGame ? (
        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Next game is being prepared — tap Refresh if this stays stuck.
          </span>
          <Button
            onClick={() => void refreshCurrentGameOperations(queryClient)}
            variant="outline"
            size="sm"
            className="self-start"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      ) : null}

      {/* A. CURRENT GAME — live, winner window, or checking */}
      {currentGame && (
        <Card
          className={cn(
            "border-green-200 bg-green-50/50",
            isBonusOperationItem(currentGame) &&
              "border-amber-300 bg-amber-50/80",
            isBigGotdOperationItem(currentGame) &&
              "border-yellow-300 bg-yellow-50/80",
          )}
        >
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Radio
                  className={cn(
                    "h-5 w-5 animate-pulse text-green-600",
                    isBonusOperationItem(currentGame) && "text-amber-700",
                    isBigGotdOperationItem(currentGame) && "text-yellow-700",
                  )}
                />
                <CardTitle
                  className={cn(
                    "text-green-900",
                    isBonusOperationItem(currentGame) && "text-amber-950",
                    isBigGotdOperationItem(currentGame) && "text-yellow-950",
                  )}
                >
                  Current Game
                </CardTitle>
                {isBigGameOperationItem(currentGame) ? (
                  <Badge className="bg-violet-100 text-violet-800">
                    Big Game
                  </Badge>
                ) : null}
                {isChainGameOperationItem(currentGame) ? (
                  <Badge className="bg-teal-100 text-teal-800">Chain Game</Badge>
                ) : null}
                {isMultiRoundOperationItem(currentGame) &&
                (currentGame.roundCount ?? 1) > 0 ? (
                  <Badge variant="outline" className="border-violet-300 text-violet-800">
                    Round {resolveDisplayedRoundIndex(currentGame)} of{" "}
                    {currentGame.roundCount ?? 1}
                    {(() => {
                      const roundPrize = resolveCurrentRoundPrize(currentGame);
                      return roundPrize
                        ? ` · ${formatCurrency(roundPrize)}`
                        : "";
                    })()}
                  </Badge>
                ) : null}
                {isBonusOperationItem(currentGame) ? (
                  <Badge className="bg-amber-200 text-amber-950 hover:bg-amber-200">
                    Bonus
                  </Badge>
                ) : null}
                {isBigGotdOperationItem(currentGame) ? (
                  <Badge className="bg-yellow-200 text-yellow-950 hover:bg-yellow-200">
                    Big GOTD
                  </Badge>
                ) : null}
                <Badge className="bg-green-100 text-green-800">
                  {currentGame.playerStatus === "winnerWindow"
                    ? "WINNER WINDOW"
                    : currentGame.playerStatus === "checking"
                      ? "CHECKING"
                      : currentGame.playerStatus === "finished"
                        ? "FINISHED"
                        : "PLAYING"}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <LoadingButton
                  variant="outline"
                  size="sm"
                  onClick={() => setCancelLiveOpen(true)}
                  isLoading={cancelLiveSession.isPending}
                  loadingLabel="Cancelling..."
                  disabled={!currentGame.sessionId || transitionLocked}
                  className="border-red-200 text-red-600 hover:bg-red-50"
                >
                  <Ban className="mr-2 h-4 w-4" />
                  Cancel
                </LoadingButton>
              </div>
            </div>
            <CardDescription>
              {currentGame.staticCode}
              {currentGame.playCode && ` / ${currentGame.playCode}`}
            </CardDescription>
            <OperationModeAndRuleLabels
              operationMode={currentGame.operationMode}
              gameRuleKey={currentGame.gameRule?.key}
              gameRuleName={currentGame.gameRule?.name}
            />
            <p className="text-sm text-muted-foreground">
              {getGameOperationStatusHint(
                currentGame,
                {
                  secondsUntilNextBall: nextAutoCallSeconds,
                  secondsUntilWinnerWindowEnd:
                    currentGame.playerStatus === "winnerWindow" &&
                    currentGame.winnerWindowEndsAt
                      ? Math.max(
                          0,
                          Math.ceil(
                            (new Date(
                              currentGame.winnerWindowEndsAt,
                            ).getTime() -
                              winnerWindowNow) /
                              1000,
                          ),
                        )
                      : null,
                },
                timeConfig ?? undefined,
              )}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {chainPauseSecondsRemaining != null ? (
              <div className="flex flex-col gap-3 rounded-lg border border-teal-300 bg-teal-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-teal-900">
                  <p className="font-medium">
                    Round {resolveDisplayedRoundIndex(currentGame)} winner reveal
                    — {chainPauseSecondsRemaining}s
                  </p>
                  <p className="text-teal-800">
                    Calling is paused. Marks and called numbers stay on the
                    board; round{" "}
                    {Math.min(
                      resolveDisplayedRoundIndex(currentGame) + 1,
                      currentGame.roundCount ?? 1,
                    )}{" "}
                    resumes automatically.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <LoadingButton
                    size="sm"
                    variant="outline"
                    className="border-teal-300 text-teal-900 hover:bg-teal-100"
                    isLoading={extendChainRoundPause.isPending}
                    loadingLabel="Extending..."
                    disabled={!currentGame.slotId}
                    onClick={() => {
                      if (!currentGame.slotId) {
                        return;
                      }
                      extendChainRoundPause.mutate(currentGame.slotId);
                    }}
                  >
                    +{CHAIN_GAME_PAUSE_EXTENSION_SECONDS}s
                  </LoadingButton>
                  <LoadingButton
                    size="sm"
                    isLoading={continueChainRoundNow.isPending}
                    loadingLabel="Resuming..."
                    disabled={!currentGame.slotId}
                    onClick={() => {
                      if (!currentGame.slotId) {
                        return;
                      }
                      continueChainRoundNow.mutate(currentGame.slotId);
                    }}
                  >
                    Continue now
                  </LoadingButton>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {isAutoCalling ? (
                <Badge
                  variant="outline"
                  className="border-red-300 bg-red-50 text-red-700"
                >
                  {nextAutoCallLabel}
                </Badge>
              ) : null}
            </div>

            <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
              <div className="flex flex-1 flex-col items-center justify-center rounded-lg border bg-white p-6">
                <p className="text-sm font-medium text-muted-foreground">
                  Latest called
                </p>
                {latestCalledNumber ? (
                  <div className="mt-4">
                    <BingoBall
                      letter={latestCalledNumber.letter}
                      number={latestCalledNumber.number}
                      size="lg"
                      isLatest
                    />
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">
                    No numbers called yet
                  </p>
                )}
              </div>

              <div className="grid flex-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <div className="rounded-lg border bg-white p-4 text-center">
                  <p className="text-sm text-muted-foreground">Called</p>
                  <p className="mt-1 text-2xl font-bold text-primary">
                    {displayedCalledCount}
                    <span className="text-base font-normal text-muted-foreground">
                      {" "}
                      / 75
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg border bg-white p-4 text-center transition hover:border-primary/40 hover:bg-primary/5 disabled:cursor-default disabled:opacity-60"
                  disabled={!currentGame.sessionId}
                  onClick={() => {
                    if (!currentGame.sessionId) {
                      return;
                    }
                    setRegisteredPlayersDialog({
                      sessionId: currentGame.sessionId,
                      label: `${currentGame.staticCode}${
                        currentGame.playCode
                          ? ` / ${currentGame.playCode}`
                          : ""
                      }`,
                    });
                  }}
                >
                  <p className="text-sm text-muted-foreground">Cartelas</p>
                  <p className="mt-1 text-2xl font-bold text-primary">
                    {currentGame.registeredCartelasCount}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Click to view players
                  </p>
                </button>
                {(() => {
                  const livePrize = resolveLivePrizePoolAmount(currentGame);
                  const totalPrize = currentGame.prizeAmount;
                  const showChainTotal =
                    isChainGameOperationItem(currentGame) &&
                    Boolean(totalPrize) &&
                    Number(livePrize) !== Number(totalPrize);
                  return (
                    <div className="rounded-lg border bg-white p-4 text-center">
                      <p className="text-sm text-muted-foreground">
                        {isChainGameOperationItem(currentGame)
                          ? "Round prize"
                          : "Prize pool"}
                      </p>
                      <p className="mt-1 text-2xl font-bold text-primary">
                        {formatCurrency(livePrize)}
                      </p>
                      {showChainTotal ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Total {formatCurrency(totalPrize)}
                        </p>
                      ) : null}
                    </div>
                  );
                })()}
              </div>
            </div>

            {currentGame.playerStatus !== "checking" ? (
              <CalledNumbersStrip
                calledNumbers={displayCalledNumbers}
                isLive={socketConnected && isAutoCalling}
              />
            ) : null}

            {isWinnerWindow &&
            currentGame.winnerWindowEndsAt &&
            chainPauseSecondsRemaining == null && (
              <div className="rounded-lg border border-violet-300 bg-violet-50 px-4 py-3 text-violet-900">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">Winner window open</p>
                    {winnerWindowDisplay.mode === "canonical" ? (
                      <div className="mt-3 space-y-1">
                        <p className="text-sm font-medium text-violet-900">
                          Winners per cartela
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {winnerWindowDisplay.canonical.map(
                            (winner) => (
                              <Badge
                                key={`${winner.cartelaId}-${winner.cartelaNumber}`}
                                variant="outline"
                                className="border-violet-300 bg-white text-violet-900"
                              >
                                #{winner.cartelaNumber}
                                {winner.amount
                                  ? ` · ${formatCurrency(winner.amount)}`
                                  : ""}
                              </Badge>
                            ),
                          )}
                        </div>
                      </div>
                    ) : winnerWindowDisplay.mode === "preview" ? (
                      <div className="mt-3 space-y-1">
                        <p className="text-sm font-medium text-violet-900">
                          Winner cartelas
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {winnerWindowDisplay.preview.map((winner) => (
                            <Badge
                              key={`${winner.sessionId}-${winner.claimId ?? winner.gameCartelaId ?? winner.cartelaNumber}`}
                              variant="outline"
                              className="border-violet-300 bg-white text-violet-900"
                            >
                              #{winner.cartelaNumber}
                            </Badge>
                          ))}
                        </div>
                        <p className="text-xs text-violet-700">
                          Waiting for payout summary.
                        </p>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-violet-800">
                        No winner cartelas recorded yet.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-violet-100 text-violet-900">
                      <Clock3 className="mr-1 h-3.5 w-3.5" />
                      {Math.max(
                        0,
                        Math.ceil(
                          (new Date(currentGame.winnerWindowEndsAt).getTime() -
                            winnerWindowNow) /
                            1000,
                        ),
                      )}
                      s left
                    </Badge>
                    <LoadingButton
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!currentGame.sessionId) {
                          return;
                        }
                        lockTransitionUi(
                          currentGame.sessionId,
                          "FINISHED",
                        );
                        finishWinnerWindow.mutate(currentGame.sessionId);
                      }}
                      isLoading={finishWinnerWindow.isPending}
                      loadingLabel="Finishing..."
                      disabled={!currentGame.sessionId || transitionLocked}
                    >
                      Finish now
                    </LoadingButton>
                  </div>
                </div>
              </div>
            )}

            {checkingGame &&
            isManualChecking &&
            bingoClaims &&
            bingoClaims.length > 0 ? (
              <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/80 p-3">
                <p className="text-sm font-medium text-amber-900">
                  Review bingo claim
                </p>
                {bingoClaims.map((claim) => (
                  <div
                    key={claim.id}
                    className="flex flex-col gap-3 rounded-lg border bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">
                        Cartela #{claim.gameCartela?.cartela?.number}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Pattern: {claim.checkedPattern}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRejectClaimTarget(claim)}
                        className="border-red-200 text-red-600 hover:bg-red-50"
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setApproveClaimTarget(claim)}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Approve
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {currentGame.playerStatus === "playing" ||
            currentGame.playerStatus === "winnerWindow" ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                {currentGame.operationMode === "MANUAL" || !isAutoCalling ? (
                  <Button
                    onClick={() => setIsCallNumberModalOpen(true)}
                    disabled={!liveSessionId || currentGame.playerStatus !== "playing"}
                    className="flex-1"
                    size="lg"
                    variant={
                      currentGame.operationMode === "AUTO"
                        ? "outline"
                        : "default"
                    }
                  >
                    <Phone className="mr-2 h-5 w-5" />
                    {currentGame.operationMode === "AUTO"
                      ? "Emergency call"
                      : "Call Number"}
                  </Button>
                ) : null}
                {isAutoCalling && liveSessionId ? (
                  <LoadingButton
                    onClick={() => stopAutoCall.mutate(liveSessionId)}
                    size="lg"
                    variant="destructive"
                    className="flex-1 sm:max-w-[240px]"
                    isLoading={stopAutoCall.isPending}
                    loadingLabel="Stopping..."
                  >
                    <PauseCircle className="mr-2 h-5 w-5" />
                    Stop auto-call
                  </LoadingButton>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* B. NEXT REGISTRATION */}
      {showNextRegistration && standardRegistrationOpenGame && (
        <Card
          className={cn(
            "border-blue-200 bg-gradient-to-br from-blue-50/80 to-slate-50",
            isBonusOperationItem(standardRegistrationOpenGame) &&
              "border-amber-300 bg-gradient-to-br from-amber-50 to-amber-100/70",
            isBigGotdOperationItem(standardRegistrationOpenGame) &&
              "border-yellow-300 bg-gradient-to-br from-yellow-50 to-yellow-100/70",
          )}
        >
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Clock3
                    className={cn(
                      "h-5 w-5 text-blue-600",
                      isBonusOperationItem(standardRegistrationOpenGame) &&
                        "text-amber-700",
                      isBigGotdOperationItem(standardRegistrationOpenGame) &&
                        "text-yellow-700",
                    )}
                  />
                  <CardTitle
                    className={cn(
                      "text-blue-950",
                      isBonusOperationItem(standardRegistrationOpenGame) &&
                        "text-amber-950",
                      isBigGotdOperationItem(standardRegistrationOpenGame) &&
                        "text-yellow-950",
                    )}
                  >
                    {currentGame
                      ? "Next round registration"
                      : "Registration open"}
                  </CardTitle>
                  <Badge
                    className={cn(
                      "bg-blue-100 text-blue-800",
                      isBonusOperationItem(standardRegistrationOpenGame) &&
                        "bg-amber-200 text-amber-950",
                      isBigGotdOperationItem(standardRegistrationOpenGame) &&
                        "bg-yellow-200 text-yellow-950",
                    )}
                  >
                    {standardRegistrationOpenGame.rawStatus === "NEXT"
                      ? "NEW"
                      : "READY"}
                  </Badge>
                  {isBonusOperationItem(standardRegistrationOpenGame) ? (
                    <Badge className="bg-amber-200 text-amber-950 hover:bg-amber-200">
                      Bonus
                    </Badge>
                  ) : null}
                  {isBigGotdOperationItem(standardRegistrationOpenGame) ? (
                    <Badge className="bg-yellow-200 text-yellow-950 hover:bg-yellow-200">
                      Big GOTD
                    </Badge>
                  ) : null}
                  {isChainGameOperationItem(standardRegistrationOpenGame) ? (
                    <Badge className="bg-teal-100 text-teal-800 hover:bg-teal-100">
                      Chain Game ·{" "}
                      {standardRegistrationOpenGame.roundCount ?? 1} rounds
                    </Badge>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {standardRegistrationOpenGame.staticCode}
                  {standardRegistrationOpenGame.playCode &&
                    ` / ${standardRegistrationOpenGame.playCode}`}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {hasClearableQueue && queue.length === 0 ? (
                  <LoadingButton
                    variant="outline"
                    size="sm"
                    onClick={() => setClearQueueOpen(true)}
                    isLoading={clearQueue.isPending}
                    loadingLabel="Clearing..."
                  >
                    Clear Waiting Queue
                  </LoadingButton>
                ) : null}
                <QueueOrderButtons
                  slotId={standardRegistrationOpenGame.slotId}
                  reorderableSlots={reorderableSlots}
                  onMove={handleReorder}
                  reorderAction={reorderAction}
                  isReordering={reorderSlots.isPending}
                />
                <LoadingButton
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setQueuedSlotAction({
                      slotId: standardRegistrationOpenGame.slotId,
                      label: standardRegistrationOpenGame.staticCode,
                      mode:
                        (standardRegistrationOpenGame.registeredCartelasCount ??
                          0) > 0
                          ? "cancel"
                          : "clear",
                      registeredCartelasCount:
                        standardRegistrationOpenGame.registeredCartelasCount,
                    })
                  }
                  isLoading={isMutationPendingFor(
                    removeQueuedSlot,
                    standardRegistrationOpenGame.slotId,
                  )}
                  loadingLabel={
                    (standardRegistrationOpenGame.registeredCartelasCount ??
                      0) > 0
                      ? "Cancelling..."
                      : "Clearing..."
                  }
                  className="border-red-200 bg-white text-red-600 hover:bg-red-50"
                >
                  {(standardRegistrationOpenGame.registeredCartelasCount ??
                    0) > 0 ? (
                    <>
                      <Ban className="mr-2 h-4 w-4" />
                      Cancel
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Clear
                    </>
                  )}
                </LoadingButton>
                {standardRegistrationOpenGame.operationMode ===
                "AUTO" ? null : (
                  // Manual Start is hidden for AUTO. Backend still allows
                  // POST /admin/slots/:id/start as an emergency override.
                  <LoadingButton
                    size="sm"
                    onClick={() => {
                      const sessionId = standardRegistrationOpenGame.sessionId;
                      if (!sessionId) {
                        return;
                      }
                      lockTransitionUi(
                        sessionId,
                        "PLAYING",
                      );
                      startGame.mutate(sessionId);
                    }}
                    isLoading={isMutationPendingFor(
                      startGame,
                      standardRegistrationOpenGame.sessionId ?? "",
                    )}
                    loadingLabel="Starting..."
                    disabled={!!currentGame || !standardRegistrationOpenGame.sessionId || transitionLocked}
                    className="bg-blue-600 hover:bg-blue-700"
                    title={
                      currentGame
                        ? "Finish or cancel the current game first"
                        : undefined
                    }
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Start Game
                  </LoadingButton>
                )}
              </div>
            </div>
            <OperationModeAndRuleLabels
              operationMode={standardRegistrationOpenGame.operationMode}
              gameRuleKey={standardRegistrationOpenGame.gameRule?.key}
              gameRuleName={standardRegistrationOpenGame.gameRule?.name}
            />
            <p className="text-sm text-muted-foreground">
              {getGameOperationStatusHint(
                standardRegistrationOpenGame,
                {
                  secondsUntilRegistrationClose: registrationSecondsLeft,
                  isSameSlotAsCurrentGame:
                    currentGame?.slotId === standardRegistrationOpenGame.slotId,
                },
                timeConfig ?? undefined,
              )}
            </p>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "grid gap-3",
                isNormalOperationItem(standardRegistrationOpenGame)
                  ? "md:grid-cols-2 xl:grid-cols-5"
                  : "md:grid-cols-3",
              )}
            >
              {standardRegistrationOpenGame.isBonus ? (
                <RegistrationStatCard
                  label="Bonus Entry"
                  value={
                    <span className="text-2xl font-bold text-emerald-700">
                      Free
                    </span>
                  }
                  hint="Free bonus registration"
                />
              ) : isNormalOperationItem(standardRegistrationOpenGame) ? (
                <>
                  <RegistrationStatCard
                    label="Entry Fee"
                    value={
                      <span className="text-2xl font-bold text-blue-700">
                        {formatCurrency(standardRegistrationOpenGame.entryFee)}
                      </span>
                    }
                    hint="Set from Time Config when the game was added"
                  />
                  <RegistrationStatCard
                    label="Commission"
                    value={
                      <span className="text-2xl font-bold text-blue-700">
                        {formatCurrency(
                          resolveCompanyFeePerCartela(
                            standardRegistrationOpenGame,
                          ),
                        )}
                      </span>
                    }
                  />
                  <RegistrationStatCard
                    label="Prize / Cartela"
                    value={
                      <span className="text-2xl font-bold text-blue-700">
                        {formatCurrency(
                          standardRegistrationOpenGame.prizePerCartela,
                        )}
                      </span>
                    }
                    hint="Entry minus commission"
                  />
                </>
              ) : (
                <RegistrationStatCard
                  label="Entry Fee"
                  value={
                    <EntryFeeEditor
                      slotId={standardRegistrationOpenGame.slotId}
                      currentFee={standardRegistrationOpenGame.entryFee}
                      canEdit={canEditEntryFee(
                        standardRegistrationOpenGame.registeredCartelasCount,
                      )}
                      isEditing={
                        selectedGameForEdit ===
                        standardRegistrationOpenGame.slotId
                      }
                      draftValue={
                        entryFeeDrafts[standardRegistrationOpenGame.slotId] ??
                        standardRegistrationOpenGame.entryFee
                      }
                      isSaving={updateEntryFee.isPending}
                      registeredCartelasCount={
                        standardRegistrationOpenGame.registeredCartelasCount
                      }
                      onStartEdit={startEntryFeeEdit}
                      onDraftChange={(value) =>
                        setEntryFeeDrafts((current) => ({
                          ...current,
                          [standardRegistrationOpenGame.slotId]: value,
                        }))
                      }
                      onSave={saveEntryFee}
                      onCancel={() => {
                        setSelectedGameForEdit(null);
                        setEntryFeeError(null);
                        setEntryFeeDrafts((current) => {
                          const next = { ...current };
                          delete next[standardRegistrationOpenGame.slotId];
                          return next;
                        });
                      }}
                    />
                  }
                  hint={
                    selectedGameForEdit === standardRegistrationOpenGame.slotId
                      ? "Minimum 8 ETB"
                      : canEditEntryFee(
                            standardRegistrationOpenGame.registeredCartelasCount,
                          )
                        ? "Click Edit to change"
                        : "Locked after first registration"
                  }
                />
              )}
              <RegistrationStatCard
                label="Prize Pool"
                value={
                  <span className="text-2xl font-bold text-blue-700">
                    {formatCurrency(standardRegistrationOpenGame.prizeAmount)}
                  </span>
                }
              />
              <RegistrationStatCard
                label="Cartelas"
                value={
                  <span className="inline-flex items-center gap-2 text-2xl font-bold text-blue-700">
                    <Users className="h-5 w-5" />
                    {standardRegistrationOpenGame.registeredCartelasCount}
                  </span>
                }
                hint={
                  standardRegistrationOpenGame.sessionId
                    ? "Click to view players"
                    : "No session yet"
                }
                onClick={
                  standardRegistrationOpenGame.sessionId
                    ? () =>
                        setRegisteredPlayersDialog({
                          sessionId:
                            standardRegistrationOpenGame.sessionId as string,
                          label: `${standardRegistrationOpenGame.staticCode}${
                            standardRegistrationOpenGame.playCode
                              ? ` / ${standardRegistrationOpenGame.playCode}`
                              : ""
                          }`,
                        })
                    : undefined
                }
              />
            </div>
            {entryFeeError &&
            selectedGameForEdit === standardRegistrationOpenGame.slotId ? (
              <p className="mt-3 text-sm text-destructive">{entryFeeError}</p>
            ) : null}
          </CardContent>
        </Card>
      )}

      {showLiveBigGameNextRegistrationCard && liveBigGameNextRegistration ? (
        <Card className="border-violet-200 bg-gradient-to-br from-violet-50/80 to-slate-50">
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Trophy className="h-5 w-5 text-violet-600" />
                  <CardTitle className="text-violet-950">
                    Next round registration
                  </CardTitle>
                  <Badge className="bg-violet-100 text-violet-800">
                    Round {liveBigGameNextRegistration.roundIndex ?? 2} of{" "}
                    {liveBigGameNextRegistration.roundCount ??
                      scheduledBigGame?.roundCount ??
                      "?"}
                  </Badge>
                  <Badge variant="outline" className="border-violet-300 text-violet-800">
                    Ready
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {liveBigGameNextRegistration.staticCode}
                  {liveBigGameNextRegistration.playCode
                    ? ` / ${liveBigGameNextRegistration.playCode}`
                    : ""}
                </p>
                <p className="text-sm text-muted-foreground">
                  {liveBigGameNextRegistration.scheduledStartAt
                    ? `Play starts ${formatDateTime(liveBigGameNextRegistration.scheduledStartAt)}`
                    : "Registration open while the current round is live — play start arms from Game Timing after this round finishes."}
                </p>
                <p className="text-sm text-muted-foreground">
                  {liveBigGameNextRegistration.registeredCartelasCount} cartelas
                  registered for this round
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <LoadingButton
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    startBigGameNextRound.mutate(
                      liveBigGameNextRegistration.gameSlotId,
                    )
                  }
                  isLoading={isMutationPendingFor(
                    startBigGameNextRound,
                    liveBigGameNextRegistration.gameSlotId,
                  )}
                  loadingLabel="Starting..."
                  disabled={!liveBigGameNextRegistration.scheduledStartAt}
                  className="border-violet-200 bg-white text-violet-800 hover:bg-violet-50"
                >
                  <Play className="mr-2 h-4 w-4" />
                  Start next round now
                </LoadingButton>
              </div>
            </div>
          </CardHeader>
        </Card>
      ) : null}

      {showScheduledBigGameCard && scheduledBigGame ? (
        <Card className="border-violet-200 bg-gradient-to-br from-violet-50/80 to-slate-50">
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Trophy className="h-5 w-5 text-violet-600" />
                  <CardTitle className="text-violet-950">Big Game</CardTitle>
                  <Badge className="bg-violet-100 text-violet-800">
                    {scheduledBigGame.heldWaitingForLiveSlot
                      ? "Held"
                      : scheduledBigGame.status === "READY" &&
                          (scheduledBigGame.roundIndex ?? 1) > 1
                        ? `Next round registration open · Round ${resolveDisplayedRoundIndex(scheduledBigGame)} of ${scheduledBigGame.roundCount ?? 1}`
                        : scheduledBigGame.status === "READY"
                          ? "Scheduled"
                          : scheduledBigGame.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {scheduledBigGame.staticCode}
                  {scheduledBigGame.playCode
                    ? ` / ${scheduledBigGame.playCode}`
                    : ""}
                  {scheduledBigGame.name ? ` · ${scheduledBigGame.name}` : ""}
                </p>
                {scheduledBigGame.heldWaitingForLiveSlot &&
                scheduledBigGame.blockingLiveGame ? (
                  <p className="text-sm text-amber-800">
                    Blocked by live game{" "}
                    <strong>
                      {scheduledBigGame.blockingLiveGame.staticCode}
                    </strong>
                    . Close or cancel it to start the Big Game.
                  </p>
                ) : null}
                <p className="text-sm text-muted-foreground">
                  Round 1 uses its own create schedule — not part of the normal
                  queue. Later rounds open as next READY from Game Timing.
                </p>
                {(scheduledBigGame.roundCount ?? 1) > 0 ? (
                  <div className="space-y-1 pt-1">
                    <p className="text-sm font-medium text-violet-900">
                      Round {resolveDisplayedRoundIndex(scheduledBigGame)} of{" "}
                      {scheduledBigGame.roundCount ?? 1}
                    </p>
                    {(() => {
                      const roundPrize =
                        resolveCurrentRoundPrize(scheduledBigGame);
                      return roundPrize ? (
                        <p className="text-sm text-muted-foreground">
                          Current round prize{" "}
                          <span className="font-semibold text-violet-800">
                            {formatCurrency(roundPrize)}
                          </span>
                        </p>
                      ) : null;
                    })()}
                    {scheduledBigGame.nextRoundStartsAt ||
                    ((scheduledBigGame.roundIndex ?? 1) > 1 &&
                      scheduledBigGame.scheduledStartAt) ? (
                      <p className="text-sm text-muted-foreground">
                        {(scheduledBigGame.roundIndex ?? 1) > 1
                          ? "Play starts "
                          : "Next round starts "}
                        {formatDateTime(
                          scheduledBigGame.scheduledStartAt ??
                            scheduledBigGame.nextRoundStartsAt,
                        )}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {scheduledBigGame.status === "READY" &&
                (scheduledBigGame.roundIndex ?? 1) <= 1 ? (
                  <LoadingButton
                    size="sm"
                    onClick={() =>
                      startBigGameNow.mutate(scheduledBigGame.gameSlotId)
                    }
                    isLoading={isMutationPendingFor(
                      startBigGameNow,
                      scheduledBigGame.gameSlotId,
                    )}
                    loadingLabel="Starting..."
                    className="bg-violet-700 text-white hover:bg-violet-800"
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Start Big Game now
                  </LoadingButton>
                ) : null}
                {(scheduledBigGame.roundCount ?? 1) > 1 ? (
                  <LoadingButton
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      startBigGameNextRound.mutate(scheduledBigGame.gameSlotId)
                    }
                    isLoading={isMutationPendingFor(
                      startBigGameNextRound,
                      scheduledBigGame.gameSlotId,
                    )}
                    loadingLabel="Starting..."
                    disabled={
                      !(
                        ((scheduledBigGame.roundIndex ?? 1) > 1 &&
                          scheduledBigGame.status === "READY") ||
                        scheduledBigGame.nextRoundStartsAt
                      )
                    }
                    className="border-violet-200 bg-white text-violet-800 hover:bg-violet-50"
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Start next round now
                  </LoadingButton>
                ) : null}
                {scheduledBigGame.status === "READY" &&
                (scheduledBigGame.roundIndex ?? 1) <= 1 &&
                !bigGameScheduleEditing ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={startBigGameScheduleEdit}
                  >
                    Edit Round 1 schedule
                  </Button>
                ) : null}
                <LoadingButton
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setQueuedSlotAction({
                      slotId: scheduledBigGame.gameSlotId,
                      label: scheduledBigGame.staticCode,
                      mode:
                        (scheduledBigGame.registeredCartelasCount ?? 0) > 0
                          ? "cancel"
                          : "clear",
                      registeredCartelasCount:
                        scheduledBigGame.registeredCartelasCount,
                    })
                  }
                  isLoading={isMutationPendingFor(
                    removeQueuedSlot,
                    scheduledBigGame.gameSlotId,
                  )}
                  loadingLabel={
                    (scheduledBigGame.registeredCartelasCount ?? 0) > 0
                      ? "Cancelling..."
                      : "Clearing..."
                  }
                  disabled={scheduledBigGame.status === "WINNER_WINDOW"}
                  className="border-red-200 bg-white text-red-600 hover:bg-red-50"
                >
                  {(scheduledBigGame.registeredCartelasCount ?? 0) > 0 ? (
                    <>
                      <Ban className="mr-2 h-4 w-4" />
                      Cancel
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Clear
                    </>
                  )}
                </LoadingButton>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <RegistrationStatCard
                label="Entry Fee"
                value={
                  <EntryFeeEditor
                    slotId={scheduledBigGame.gameSlotId}
                    currentFee={scheduledBigGame.entryFee}
                    canEdit={canEditEntryFee(
                      scheduledBigGame.registeredCartelasCount,
                    )}
                    isEditing={
                      selectedGameForEdit === scheduledBigGame.gameSlotId
                    }
                    draftValue={
                      entryFeeDrafts[scheduledBigGame.gameSlotId] ??
                      scheduledBigGame.entryFee
                    }
                    isSaving={updateEntryFee.isPending}
                    registeredCartelasCount={
                      scheduledBigGame.registeredCartelasCount
                    }
                    onStartEdit={startEntryFeeEdit}
                    onDraftChange={(value) =>
                      setEntryFeeDrafts((current) => ({
                        ...current,
                        [scheduledBigGame.gameSlotId]: value,
                      }))
                    }
                    onSave={saveEntryFee}
                    onCancel={() => {
                      setSelectedGameForEdit(null);
                      setEntryFeeError(null);
                      setEntryFeeDrafts((current) => {
                        const next = { ...current };
                        delete next[scheduledBigGame.gameSlotId];
                        return next;
                      });
                    }}
                    valueClassName="text-violet-700"
                  />
                }
                hint={
                  selectedGameForEdit === scheduledBigGame.gameSlotId
                    ? "Minimum 8 ETB"
                    : canEditEntryFee(scheduledBigGame.registeredCartelasCount)
                      ? "Click Edit to change"
                      : "Locked after first registration"
                }
              />
              <RegistrationStatCard
                label="Prize Pool"
                value={
                  <span className="text-2xl font-bold text-violet-700">
                    {formatCurrency(
                      scheduledBigGame.fixedPrizeAmount ??
                        scheduledBigGame.prizeAmount,
                    )}
                  </span>
                }
              />
              <RegistrationStatCard
                label="Round 1 registration opens"
                value={
                  bigGameScheduleEditing ? (
                    <Input
                      type="datetime-local"
                      value={bigGameScheduleRegistrationDraft}
                      onChange={(event) =>
                        setBigGameScheduleRegistrationDraft(event.target.value)
                      }
                      className="text-sm"
                    />
                  ) : (
                    <span className="text-base font-semibold text-violet-900">
                      {formatDateTime(scheduledBigGame.registrationOpensAt)}
                    </span>
                  )
                }
              />
              <RegistrationStatCard
                label="Round 1 play starts"
                value={
                  bigGameScheduleEditing ? (
                    <Input
                      type="datetime-local"
                      value={bigGameSchedulePlayStartDraft}
                      onChange={(event) =>
                        setBigGameSchedulePlayStartDraft(event.target.value)
                      }
                      className="text-sm"
                    />
                  ) : (
                    <span className="text-base font-semibold text-violet-900">
                      {formatDateTime(scheduledBigGame.scheduledStartAt)}
                    </span>
                  )
                }
              />
            </div>
            {bigGameScheduleEditing ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <LoadingButton
                  size="sm"
                  onClick={() =>
                    saveBigGameSchedule(scheduledBigGame.gameSlotId)
                  }
                  isLoading={updateBigGameSchedule.isPending}
                  loadingLabel="Saving..."
                  className="bg-violet-700 hover:bg-violet-800"
                >
                  Save schedule
                </LoadingButton>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setBigGameScheduleEditing(false);
                    setBigGameScheduleError(null);
                  }}
                  disabled={updateBigGameSchedule.isPending}
                >
                  Cancel edit
                </Button>
              </div>
            ) : null}
            {bigGameScheduleError ? (
              <p className="mt-3 text-sm text-destructive">
                {bigGameScheduleError}
              </p>
            ) : null}
            {entryFeeError &&
            selectedGameForEdit === scheduledBigGame.gameSlotId ? (
              <p className="mt-3 text-sm text-destructive">{entryFeeError}</p>
            ) : null}
            <button
              type="button"
              className="mt-3 text-left text-sm text-muted-foreground transition hover:text-violet-800 disabled:cursor-default"
              disabled={!scheduledBigGame.sessionId}
              onClick={() => {
                if (!scheduledBigGame.sessionId) {
                  return;
                }
                setRegisteredPlayersDialog({
                  sessionId: scheduledBigGame.sessionId,
                  label: `${scheduledBigGame.staticCode}${
                    scheduledBigGame.playCode
                      ? ` / ${scheduledBigGame.playCode}`
                      : ""
                  }`,
                });
              }}
            >
              <Users className="mr-1 inline h-4 w-4" />
              {scheduledBigGame.registeredCartelasCount} cartelas registered
              {typeof scheduledBigGame.registeredByMoneyCount === "number" ||
              typeof scheduledBigGame.registeredByTicketCount === "number"
                ? ` · ${scheduledBigGame.registeredByMoneyCount ?? 0} money · ${scheduledBigGame.registeredByTicketCount ?? 0} ticket${
                    (scheduledBigGame.registeredByCarriedCount ?? 0) > 0
                      ? ` · ${scheduledBigGame.registeredByCarriedCount} carried`
                      : ""
                  }`
                : ""}
              {scheduledBigGame.sessionId ? " · view players" : ""}
            </button>
          </CardContent>
        </Card>
      ) : null}

      {/* Empty state + queue */}
      <div ref={queueSectionRef} className="scroll-mt-4 space-y-6">
        {!currentGame &&
          !standardRegistrationOpenGame &&
          queue.length === 0 &&
          !showScheduledBigGameCard && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="mb-4 rounded-full bg-muted p-3">
                  <Plus className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-lg font-medium">No games in queue</p>
                <p className="mb-4 text-sm text-muted-foreground">
                  Create a new game to get started
                </p>
                <Button onClick={openCreateGameModal} variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Game to Queue
                </Button>
              </CardContent>
            </Card>
          )}

        {/* C. QUEUE */}
        {queue.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Queue</CardTitle>
                {hasClearableQueue ? (
                  <LoadingButton
                    variant="outline"
                    size="sm"
                    onClick={() => setClearQueueOpen(true)}
                    isLoading={clearQueue.isPending}
                    loadingLabel="Clearing..."
                    className="self-start sm:self-auto"
                  >
                    Clear Waiting Queue
                  </LoadingButton>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-[min(28rem,55vh)] space-y-2 overflow-y-auto overscroll-y-contain pr-1">
                {queue.map((game) => {
                  const queuePosition =
                    reorderableSlots.findIndex(
                      (slot) => slot.slotId === game.slotId,
                    ) + 1;

                  return (
                    <div
                      key={getOperationItemKey(game)}
                      className={cn(
                        "flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between",
                        getCategorySurfaceClassName(game),
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                        <span
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium",
                            isBonusOperationItem(game) &&
                              "bg-amber-200/80 text-amber-950",
                            isBigGotdOperationItem(game) &&
                              "bg-yellow-200/80 text-yellow-950",
                          )}
                        >
                          {queuePosition}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">
                              {game.gameRule?.name || "Game"}
                            </p>
                            <Badge variant="outline" className="text-xs">
                              {game.rawStatus === "READY" ? "Ready" : "New"}
                            </Badge>
                            {isBonusOperationItem(game) ? (
                              <Badge className="bg-amber-200 text-amber-950 hover:bg-amber-200">
                                Bonus
                              </Badge>
                            ) : null}
                            {isBigGotdOperationItem(game) ? (
                              <Badge className="bg-yellow-200 text-yellow-950 hover:bg-yellow-200">
                                Big GOTD
                              </Badge>
                            ) : null}
                            {isChainGameOperationItem(game) ? (
                              <Badge className="bg-teal-100 text-teal-800 hover:bg-teal-100">
                                Chain Game · {game.roundCount ?? 1} rounds
                              </Badge>
                            ) : null}
                            {game.isBigGame ? (
                              <Badge className="bg-violet-100 text-violet-900 hover:bg-violet-100">
                                Big Game
                              </Badge>
                            ) : null}
                            {game.operationMode === "AUTO" ? (
                              <Badge
                                variant="outline"
                                className="border-blue-300 text-xs text-blue-700"
                              >
                                Auto
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {game.staticCode} • Entry:{" "}
                            {formatCurrency(game.entryFee)}
                            {isNormalOperationItem(game) ? (
                              <>
                                {" "}
                                • Commission:{" "}
                                {formatCurrency(
                                  game.companyFeePerCartela ??
                                    resolveCompanyFeePerCartela(game),
                                )}
                              </>
                            ) : null}{" "}
                            • Prize: {formatCurrency(game.prizeAmount)}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                        <QueueOrderButtons
                          slotId={game.slotId}
                          reorderableSlots={reorderableSlots}
                          onMove={handleReorder}
                          reorderAction={reorderAction}
                          isReordering={reorderSlots.isPending}
                        />
                        <LoadingButton
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setQueuedSlotAction({
                              slotId: game.slotId,
                              label: game.staticCode,
                              mode: "clear",
                              registeredCartelasCount:
                                game.registeredCartelasCount,
                            })
                          }
                          isLoading={isMutationPendingFor(
                            removeQueuedSlot,
                            game.slotId,
                          )}
                          loadingLabel="..."
                          className="text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Clear from queue"
                        >
                          <Trash2 className="h-4 w-4" />
                        </LoadingButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog
        open={isCreateGameModalOpen}
        onOpenChange={(open) => {
          setIsCreateGameModalOpen(open);
          if (!open) {
            setCreateGameError(null);
            setCreateGameCategory("NORMAL");
            setBonusFixedPrizeAmount("");
            setBonusMaxCartelasPerPlayer("5");
            setBigGotdEntryFee("");
            setBigGameEntryFee("");
            setBigGameFixedPrizeAmount("");
            setBigGameRegistrationOpensAt("");
            setBigGamePlayStartAt("");
            setBigGameRoundCount("1");
            setBigGameRoundPrizes([""]);
            setBigGameRoundRuleIds([]);
            setChainGameEntryFee("");
            setChainGameFixedPrizeAmount("");
            setChainGameMaxCartelasPerPlayer("5");
            setChainGameRoundCount(String(CHAIN_GAME_MIN_ROUND_COUNT));
            setChainGameRoundPrizes(
              Array.from({ length: CHAIN_GAME_MIN_ROUND_COUNT }, () => ""),
            );
            setChainGameRoundRuleIds([]);
            setChainGameInterRoundDelaySeconds(
              CHAIN_GAME_DEFAULT_INTER_ROUND_DELAY_SECONDS,
            );
            setNormalMaxCartelasPerPlayer("");
            setForceBigGameEnabled(false);
            setForceBigGameCartelaCount("2");
          }
        }}
      >
        <DialogContent
          className={cn(
            "flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md",
            (createGameCategory === "BIG_GAME" ||
              createGameCategory === "CHAIN_GAME") &&
              "sm:max-w-lg",
          )}
        >
          <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
            <DialogTitle>Add Game to Queue</DialogTitle>
            <DialogDescription>
              {createGameCategory === "BIG_GAME"
                ? "Schedule a Big Game with entry fee, prize pool, registration open time, and play start time."
                : createGameCategory === "CHAIN_GAME"
                  ? "Create a paid multi-round game that plays every round in one continuous draw. Balls and marked cells carry over; only the pattern and prize change between rounds. Queued and auto-called like a Big GOTD."
                  : createGameCategory === "BIG_GOTD"
                    ? "Create a paid fixed-prize Big GOTD round. Added at the end of the standard queue; removed after it finishes or is cancelled."
                    : createGameCategory === "BONUS"
                      ? "Create a free fixed-prize bonus round. Added at the end of the queue; removed after it finishes or is cancelled."
                      : "Choose a game type and active rule. Normal game economics start from Time Config and update it when you add the game."}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain px-6 py-4">
            <div className="space-y-2">
              <Label>Game type</Label>
              <Select
                value={createGameCategory}
                onValueChange={(value) =>
                  setCreateGameCategory(value as GameCategory)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a game type" />
                </SelectTrigger>
                <SelectContent position="popper" className="z-[100]">
                  <SelectItem value="NORMAL">Normal Game</SelectItem>
                  <SelectItem value="BONUS">Bonus Game</SelectItem>
                  <SelectItem value="BIG_GOTD">Big GOTD</SelectItem>
                  <SelectItem value="CHAIN_GAME">Chain Game</SelectItem>
                  <SelectItem value="BIG_GAME" disabled={hasActiveBigGame}>
                    Big Game
                    {hasActiveBigGame ? " (already scheduled)" : ""}
                  </SelectItem>
                </SelectContent>
              </Select>
              {hasActiveBigGame ? (
                <p className="text-sm text-muted-foreground">
                  A Big Game is already scheduled.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>
                {(createGameCategory === "BIG_GAME" &&
                  Number(bigGameRoundCount) > 1) ||
                createGameCategory === "CHAIN_GAME"
                  ? "Default game rule (Round 1)"
                  : "Game rule"}
              </Label>
              <Select
                value={selectedRuleId}
                onValueChange={(value) => {
                  setSelectedRuleId(value);
                  setBigGameRoundRuleIds((current) => {
                    if (Number(bigGameRoundCount) <= 1) {
                      return [value];
                    }
                    const resized = resizeRoundRuleDrafts(
                      current,
                      Number(bigGameRoundCount),
                      value,
                    );
                    resized[0] = value;
                    return resized;
                  });
                  setChainGameRoundRuleIds((current) => {
                    const resized = resizeRoundRuleDrafts(
                      current,
                      Number(chainGameRoundCount) ||
                        CHAIN_GAME_MIN_ROUND_COUNT,
                      value,
                    );
                    resized[0] = value;
                    return resized;
                  });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a game rule" />
                </SelectTrigger>
                <SelectContent position="popper" className="z-[100] max-h-60">
                  {activeGameRules.map((rule) => (
                    <SelectItem key={rule.id} value={rule.id}>
                      {rule.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeGameRules.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No active game rules found.
                </p>
              ) : null}
            </div>

            {createGameCategory === "BONUS" ||
            createGameCategory === "BIG_GOTD" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {createGameCategory === "BIG_GOTD" ? (
                  <div className="space-y-2">
                    <Label htmlFor="big-gotd-entry-fee">Entry fee (ETB)</Label>
                    <Input
                      id="big-gotd-entry-fee"
                      inputMode="decimal"
                      placeholder="25"
                      value={bigGotdEntryFee}
                      onChange={(event) =>
                        setBigGotdEntryFee(event.target.value)
                      }
                    />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="bonus-fixed-prize">Fixed prize</Label>
                  <Input
                    id="bonus-fixed-prize"
                    inputMode="decimal"
                    placeholder="5000"
                    value={bonusFixedPrizeAmount}
                    onChange={(event) =>
                      setBonusFixedPrizeAmount(event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bonus-max-cartelas">
                    Max cartelas per player
                  </Label>
                  <Input
                    id="bonus-max-cartelas"
                    type="number"
                    min={1}
                    max={100}
                    value={bonusMaxCartelasPerPlayer}
                    onChange={(event) =>
                      setBonusMaxCartelasPerPlayer(event.target.value)
                    }
                  />
                </div>
              </div>
            ) : null}

            {createGameCategory === "NORMAL" ? (
              <div className="space-y-4">
                <NormalEconomicsEditor
                  entryFee={normalEntryFeeDraft}
                  companyFeePerCartela={normalCommissionDraft}
                  prizePerCartela={computePrizePerCartelaFromEconomics(
                    normalEntryFeeDraft,
                    normalCommissionDraft,
                  )}
                  onEntryFeeChange={setNormalEntryFeeDraft}
                  onCommissionChange={setNormalCommissionDraft}
                />
                <div className="space-y-2">
                  <Label htmlFor="normal-max-cartelas">
                    Max cartelas per player (optional)
                  </Label>
                  <Input
                    id="normal-max-cartelas"
                    type="number"
                    min={1}
                    max={100}
                    placeholder="Unlimited"
                    value={normalMaxCartelasPerPlayer}
                    onChange={(event) =>
                      setNormalMaxCartelasPerPlayer(event.target.value)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty for no limit. When set, each player can register
                    at most this many cartelas in the game.
                  </p>
                </div>
              </div>
            ) : null}

            {createGameCategory === "BIG_GAME" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="big-game-entry-fee">Entry fee (ETB)</Label>
                  <Input
                    id="big-game-entry-fee"
                    inputMode="decimal"
                    placeholder="25"
                    value={bigGameEntryFee}
                    onChange={(event) => setBigGameEntryFee(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="big-game-fixed-prize">Prize pool (ETB)</Label>
                  <Input
                    id="big-game-fixed-prize"
                    inputMode="decimal"
                    placeholder="10000"
                    value={bigGameFixedPrizeAmount}
                    onChange={(event) =>
                      setBigGameFixedPrizeAmount(event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="big-game-registration-opens">
                    Round 1 registration opens
                  </Label>
                  <Input
                    id="big-game-registration-opens"
                    type="datetime-local"
                    value={bigGameRegistrationOpensAt}
                    onChange={(event) =>
                      setBigGameRegistrationOpensAt(event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="big-game-play-start">
                    Round 1 play starts
                  </Label>
                  <Input
                    id="big-game-play-start"
                    type="datetime-local"
                    value={bigGamePlayStartAt}
                    onChange={(event) =>
                      setBigGamePlayStartAt(event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="big-game-round-count">Rounds</Label>
                  <Input
                    id="big-game-round-count"
                    type="number"
                    min={1}
                    max={10}
                    value={bigGameRoundCount}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setBigGameRoundCount(nextValue);
                      const nextCount = Number(nextValue);
                      if (Number.isInteger(nextCount) && nextCount >= 1 && nextCount <= 10) {
                        setBigGameRoundPrizes((current) =>
                          resizeRoundPrizeDrafts(current, nextCount),
                        );
                        setBigGameRoundRuleIds((current) =>
                          resizeRoundRuleDrafts(
                            current,
                            nextCount,
                            selectedRuleId,
                          ),
                        );
                      }
                    }}
                  />
                </div>
                {Number(bigGameRoundCount) > 1 ? (
                  <RoundConfigEditor
                    idPrefix="big-game"
                    roundPrizes={bigGameRoundPrizes}
                    roundRuleIds={bigGameRoundRuleIds}
                    fallbackRuleId={selectedRuleId}
                    activeGameRules={activeGameRules}
                    hideInterRoundDelay
                    onRoundPrizeChange={(index, value) =>
                      setBigGameRoundPrizes((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? value : item,
                        ),
                      )
                    }
                    onRoundRuleChange={(index, value) => {
                      setBigGameRoundRuleIds((current) => {
                        const resized = resizeRoundRuleDrafts(
                          current,
                          Number(bigGameRoundCount) ||
                            bigGameRoundPrizes.length,
                          selectedRuleId,
                        );
                        resized[index] = value;
                        return resized;
                      });
                      if (index === 0) {
                        setSelectedRuleId(value);
                      }
                    }}
                  />
                ) : null}
                {Number(bigGameRoundCount) > 1 ? (
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    Round 1 uses the schedule above. When a round starts, the next
                    round opens as READY for missed players; after that round
                    finishes, play start uses the global registration duration
                    from Game Timing (same as normal AUTO games).
                  </p>
                ) : null}
              </div>
            ) : null}

            {createGameCategory === "CHAIN_GAME" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="chain-game-entry-fee">Entry fee (ETB)</Label>
                  <Input
                    id="chain-game-entry-fee"
                    inputMode="decimal"
                    placeholder="25"
                    value={chainGameEntryFee}
                    onChange={(event) =>
                      setChainGameEntryFee(event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="chain-game-fixed-prize">
                    Total prize pool (ETB)
                  </Label>
                  <Input
                    id="chain-game-fixed-prize"
                    inputMode="decimal"
                    placeholder="5000"
                    value={chainGameFixedPrizeAmount}
                    onChange={(event) =>
                      setChainGameFixedPrizeAmount(event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="chain-game-max-cartelas">
                    Max cartelas per player
                  </Label>
                  <Input
                    id="chain-game-max-cartelas"
                    type="number"
                    min={1}
                    max={100}
                    value={chainGameMaxCartelasPerPlayer}
                    onChange={(event) =>
                      setChainGameMaxCartelasPerPlayer(event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="chain-game-round-count">Rounds</Label>
                  <Input
                    id="chain-game-round-count"
                    type="number"
                    min={CHAIN_GAME_MIN_ROUND_COUNT}
                    max={10}
                    value={chainGameRoundCount}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setChainGameRoundCount(nextValue);
                      const nextCount = Number(nextValue);
                      if (
                        Number.isInteger(nextCount) &&
                        nextCount >= CHAIN_GAME_MIN_ROUND_COUNT &&
                        nextCount <= 10
                      ) {
                        setChainGameRoundPrizes((current) =>
                          resizeRoundPrizeDrafts(current, nextCount),
                        );
                        setChainGameRoundRuleIds((current) =>
                          resizeRoundRuleDrafts(
                            current,
                            nextCount,
                            selectedRuleId,
                          ),
                        );
                      }
                    }}
                  />
                </div>
                <RoundConfigEditor
                  idPrefix="chain-game"
                  roundPrizes={chainGameRoundPrizes}
                  roundRuleIds={chainGameRoundRuleIds}
                  fallbackRuleId={selectedRuleId}
                  activeGameRules={activeGameRules}
                  interRoundDelaySeconds={chainGameInterRoundDelaySeconds}
                  minDelaySeconds={CHAIN_GAME_MIN_INTER_ROUND_DELAY_SECONDS}
                  maxDelaySeconds={CHAIN_GAME_MAX_INTER_ROUND_DELAY_SECONDS}
                  delayHelpText="How long the live game pauses on the winner reveal before the next round resumes calling."
                  onInterRoundDelayChange={setChainGameInterRoundDelaySeconds}
                  onRoundPrizeChange={(index, value) =>
                    setChainGameRoundPrizes((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? value : item,
                      ),
                    )
                  }
                  onRoundRuleChange={(index, value) => {
                    setChainGameRoundRuleIds((current) => {
                      const resized = resizeRoundRuleDrafts(
                        current,
                        Number(chainGameRoundCount) ||
                          chainGameRoundPrizes.length,
                        selectedRuleId,
                      );
                      resized[index] = value;
                      return resized;
                    });
                    if (index === 0) {
                      setSelectedRuleId(value);
                    }
                  }}
                />
                {chainGameEasierPatternWarning ? (
                  <p className="sm:col-span-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                    {chainGameEasierPatternWarning}
                  </p>
                ) : null}
              </div>
            ) : null}

            {createGameCategory === "NORMAL" ||
            createGameCategory === "BONUS" ||
            createGameCategory === "BIG_GOTD" ? (
              <div className="space-y-3 rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="force-big-game-enabled">
                      Force Big Tickets
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {hasActiveBigGame
                        ? "Total Big Tickets from this game's winners into the scheduled Big Game (1 winner gets all; 2 winners split, except 1 gives 1 each; 3+ get none). Use 1, or an even number from 2 to 10."
                        : "Requires an active/scheduled Big Game."}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      id="force-big-game-enabled"
                      type="checkbox"
                      checked={forceBigGameEnabled && hasActiveBigGame}
                      disabled={!hasActiveBigGame}
                      onChange={(event) =>
                        setForceBigGameEnabled(event.target.checked)
                      }
                      className="size-4 rounded border-border"
                    />
                    On
                  </label>
                </div>
                {forceBigGameEnabled && hasActiveBigGame ? (
                  <div className="space-y-2">
                    <Label htmlFor="force-big-game-cartela-count">
                      Total Big Tickets
                    </Label>
                    <Input
                      id="force-big-game-cartela-count"
                      type="number"
                      min={1}
                      max={10}
                      step={1}
                      value={forceBigGameCartelaCount}
                      onChange={(event) =>
                        setForceBigGameCartelaCount(event.target.value)
                      }
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {createGameError ? (
              <p className="text-sm text-destructive">{createGameError}</p>
            ) : null}
          </div>

          <DialogFooter className="shrink-0 border-t px-6 py-3">
            <Button
              variant="outline"
              onClick={() => setIsCreateGameModalOpen(false)}
            >
              Cancel
            </Button>
            <LoadingButton
              onClick={() => {
                if (!selectedRuleId) {
                  setCreateGameError("Select a game rule first.");
                  return;
                }

                if (createGameCategory === "BONUS") {
                  if (!bonusFixedPrizeAmount.trim()) {
                    setCreateGameError(
                      "Enter the fixed prize for the bonus game.",
                    );
                    return;
                  }

                  const maxCartelas = Number(bonusMaxCartelasPerPlayer);
                  if (!Number.isFinite(maxCartelas) || maxCartelas < 1) {
                    setCreateGameError(
                      "Enter a valid max cartelas per player value.",
                    );
                    return;
                  }
                }

                if (createGameCategory === "BIG_GOTD") {
                  if (!bigGotdEntryFee.trim()) {
                    setCreateGameError("Enter the Big GOTD entry fee.");
                    return;
                  }

                  if (!bonusFixedPrizeAmount.trim()) {
                    setCreateGameError("Enter the fixed prize for Big GOTD.");
                    return;
                  }

                  const maxCartelas = Number(bonusMaxCartelasPerPlayer);
                  if (!Number.isFinite(maxCartelas) || maxCartelas < 1) {
                    setCreateGameError(
                      "Enter a valid max cartelas per player value.",
                    );
                    return;
                  }
                }

                if (createGameCategory === "BIG_GAME") {
                  if (!bigGameEntryFee.trim()) {
                    setCreateGameError("Enter the Big Game entry fee.");
                    return;
                  }

                  if (!bigGameFixedPrizeAmount.trim()) {
                    setCreateGameError("Enter the Big Game prize pool.");
                    return;
                  }

                  const roundCount = Number(bigGameRoundCount);
                  if (
                    !Number.isInteger(roundCount) ||
                    roundCount < 1 ||
                    roundCount > 10
                  ) {
                    setCreateGameError("Rounds must be an integer from 1 to 10.");
                    return;
                  }

                  const roundPrizes =
                    roundCount > 1
                      ? resizeRoundPrizeDrafts(bigGameRoundPrizes, roundCount).map(
                          (value) => value.trim(),
                        )
                      : undefined;

                  if (roundCount > 1) {
                    if (!roundPrizes || roundPrizes.some((value) => !value)) {
                      setCreateGameError(
                        "Enter a prize for every Big Game round.",
                      );
                      return;
                    }

                    const prizesSum = sumMoneyDrafts(roundPrizes);
                    const prizePool = Number(bigGameFixedPrizeAmount.trim());
                    if (
                      prizesSum == null ||
                      !Number.isFinite(prizePool) ||
                      Math.round(prizesSum * 100) !== Math.round(prizePool * 100)
                    ) {
                      setCreateGameError(
                        "Round prizes must sum to the prize pool.",
                      );
                      return;
                    }
                  }

                  const roundGameRuleIds =
                    roundCount > 1
                      ? resizeRoundRuleDrafts(
                          bigGameRoundRuleIds,
                          roundCount,
                          selectedRuleId,
                        )
                      : undefined;

                  if (roundCount > 1) {
                    if (
                      !roundGameRuleIds ||
                      roundGameRuleIds.some((value) => !value)
                    ) {
                      setCreateGameError(
                        "Select a game rule for every Big Game round.",
                      );
                      return;
                    }
                  }

                  const primaryGameRuleId =
                    roundCount > 1 && roundGameRuleIds
                      ? roundGameRuleIds[0]
                      : selectedRuleId;

                  const registrationOpensAt = datetimeLocalToIso(
                    bigGameRegistrationOpensAt,
                  );
                  const playStartAt = datetimeLocalToIso(bigGamePlayStartAt);

                  if (!registrationOpensAt || !playStartAt) {
                    setCreateGameError(
                      "Enter valid registration open and play start times.",
                    );
                    return;
                  }

                  if (
                    new Date(registrationOpensAt).getTime() >=
                    new Date(playStartAt).getTime()
                  ) {
                    setCreateGameError(
                      "Registration must open before play starts.",
                    );
                    return;
                  }

                  lastCreateCategoryRef.current = "BIG_GAME";
                  createGame.mutate({
                    payload: {
                      gameRuleId: primaryGameRuleId,
                      category: "BIG_GAME",
                      entryFee: bigGameEntryFee.trim(),
                      fixedPrizeAmount: bigGameFixedPrizeAmount.trim(),
                      registrationOpensAt,
                      playStartAt,
                      operationMode: "AUTO",
                      roundCount,
                      ...(roundCount > 1
                        ? {
                            roundPrizes,
                            roundGameRuleIds,
                          }
                        : {}),
                    },
                  });
                  return;
                }

                if (createGameCategory === "CHAIN_GAME") {
                  if (!chainGameEntryFee.trim()) {
                    setCreateGameError("Enter the Chain Game entry fee.");
                    return;
                  }

                  if (!chainGameFixedPrizeAmount.trim()) {
                    setCreateGameError("Enter the total prize pool.");
                    return;
                  }

                  const maxCartelas = Number(chainGameMaxCartelasPerPlayer);
                  if (
                    !Number.isInteger(maxCartelas) ||
                    maxCartelas < 1 ||
                    maxCartelas > 100
                  ) {
                    setCreateGameError(
                      "Max cartelas per player must be an integer from 1 to 100.",
                    );
                    return;
                  }

                  const roundCount = Number(chainGameRoundCount);
                  if (
                    !Number.isInteger(roundCount) ||
                    roundCount < CHAIN_GAME_MIN_ROUND_COUNT ||
                    roundCount > 10
                  ) {
                    setCreateGameError(
                      `Chain games need between ${CHAIN_GAME_MIN_ROUND_COUNT} and 10 rounds. Use a Big GOTD for a single round.`,
                    );
                    return;
                  }

                  const roundPrizes = resizeRoundPrizeDrafts(
                    chainGameRoundPrizes,
                    roundCount,
                  ).map((value) => value.trim());

                  if (roundPrizes.some((value) => !value)) {
                    setCreateGameError("Enter a prize for every round.");
                    return;
                  }

                  const prizesSum = sumMoneyDrafts(roundPrizes);
                  const prizePool = Number(chainGameFixedPrizeAmount.trim());
                  if (
                    prizesSum == null ||
                    !Number.isFinite(prizePool) ||
                    Math.round(prizesSum * 100) !== Math.round(prizePool * 100)
                  ) {
                    setCreateGameError(
                      "Round prizes must sum to the total prize pool.",
                    );
                    return;
                  }

                  const roundGameRuleIds = resizeRoundRuleDrafts(
                    chainGameRoundRuleIds,
                    roundCount,
                    selectedRuleId,
                  );

                  if (roundGameRuleIds.some((value) => !value)) {
                    setCreateGameError(
                      "Select a game rule for every chain round.",
                    );
                    return;
                  }

                  const interRoundDelaySeconds = Number(
                    chainGameInterRoundDelaySeconds,
                  );
                  if (
                    !Number.isInteger(interRoundDelaySeconds) ||
                    interRoundDelaySeconds <
                      CHAIN_GAME_MIN_INTER_ROUND_DELAY_SECONDS ||
                    interRoundDelaySeconds >
                      CHAIN_GAME_MAX_INTER_ROUND_DELAY_SECONDS
                  ) {
                    setCreateGameError(
                      `Inter-round pause must be between ${CHAIN_GAME_MIN_INTER_ROUND_DELAY_SECONDS} and ${CHAIN_GAME_MAX_INTER_ROUND_DELAY_SECONDS} seconds.`,
                    );
                    return;
                  }

                  const chainDefaults = getCreateFormDefaults(
                    defaultOperationMode,
                    timeConfig,
                  );

                  lastCreateCategoryRef.current = "CHAIN_GAME";
                  createGame.mutate({
                    payload: {
                      gameRuleId: roundGameRuleIds[0],
                      category: "CHAIN_GAME",
                      entryFee: chainGameEntryFee.trim(),
                      fixedPrizeAmount: chainGameFixedPrizeAmount.trim(),
                      maxCartelasPerPlayer: maxCartelas,
                      // Chain games pause and resume themselves, so the server
                      // must own the calling cadence.
                      operationMode: "AUTO",
                      registrationDurationSeconds: Number(
                        chainDefaults.registrationDurationSeconds,
                      ),
                      autoCallIntervalSeconds: Number(
                        chainDefaults.autoCallIntervalSeconds,
                      ),
                      roundCount,
                      roundPrizes,
                      roundGameRuleIds,
                      interRoundDelaySeconds,
                    },
                  });
                  return;
                }

                if (
                  (createGameCategory === "NORMAL" ||
                    createGameCategory === "BONUS" ||
                    createGameCategory === "BIG_GOTD") &&
                  forceBigGameEnabled
                ) {
                  if (!hasActiveBigGame) {
                    setCreateGameError(
                      "Force Big Tickets requires an active Big Game.",
                    );
                    return;
                  }

                  const forceCount = Number(forceBigGameCartelaCount);
                  const isAllowedForceCount =
                    Number.isInteger(forceCount) &&
                    forceCount >= 1 &&
                    forceCount <= 10 &&
                    (forceCount === 1 || forceCount % 2 === 0);
                  if (!isAllowedForceCount) {
                    setCreateGameError(
                      "Total Big Tickets must be 1, or an even number from 2 to 10.",
                    );
                    return;
                  }
                }

                if (createGameCategory === "NORMAL") {
                  const economicsError = validateNormalEconomicsDraft(
                    normalEntryFeeDraft,
                    normalCommissionDraft,
                  );
                  if (economicsError) {
                    setCreateGameError(economicsError);
                    return;
                  }

                  const normalMaxRaw = normalMaxCartelasPerPlayer.trim();
                  if (normalMaxRaw.length > 0) {
                    const maxCartelas = Number(normalMaxRaw);
                    if (
                      !Number.isInteger(maxCartelas) ||
                      maxCartelas < 1 ||
                      maxCartelas > 100
                    ) {
                      setCreateGameError(
                        "Max cartelas per player must be an integer from 1 to 100, or leave empty for unlimited.",
                      );
                      return;
                    }
                  }
                }

                const defaults = getCreateFormDefaults(
                  defaultOperationMode,
                  timeConfig,
                );

                const baselineEconomics =
                  resolveNormalEconomicsFromTimeConfig(timeConfig);

                lastCreateCategoryRef.current = createGameCategory;
                createGame.mutate({
                  payload: {
                    gameRuleId: selectedRuleId,
                    category: createGameCategory,
                    ...(createGameCategory === "BONUS" ||
                    createGameCategory === "BIG_GOTD"
                      ? {
                          ...(createGameCategory === "BIG_GOTD"
                            ? { entryFee: bigGotdEntryFee.trim() }
                            : {}),
                          fixedPrizeAmount: bonusFixedPrizeAmount.trim(),
                          maxCartelasPerPlayer: Number(bonusMaxCartelasPerPlayer),
                        }
                      : {}),
                    ...(createGameCategory === "NORMAL" ||
                    createGameCategory === "BONUS" ||
                    createGameCategory === "BIG_GOTD"
                      ? forceBigGameEnabled && hasActiveBigGame
                        ? {
                            forceBigGameEnabled: true,
                            forceBigGameCartelaCount: Number(
                              forceBigGameCartelaCount,
                            ),
                          }
                        : { forceBigGameEnabled: false }
                      : {}),
                    operationMode: defaults.operationMode,
                    ...(defaults.operationMode === "AUTO"
                      ? {
                          registrationDurationSeconds: Number(
                            defaults.registrationDurationSeconds,
                          ),
                          autoCallIntervalSeconds: Number(
                            defaults.autoCallIntervalSeconds,
                          ),
                        }
                      : {}),
                    ...(createGameCategory === "NORMAL" &&
                    normalMaxCartelasPerPlayer.trim().length > 0
                      ? {
                          maxCartelasPerPlayer: Number(
                            normalMaxCartelasPerPlayer.trim(),
                          ),
                        }
                      : {}),
                  },
                  ...(createGameCategory === "NORMAL"
                    ? {
                        normalEconomics: {
                          entryFee: normalEntryFeeDraft.trim(),
                          companyFeePerCartela: normalCommissionDraft.trim(),
                          baselineEntryFee: baselineEconomics.entryFee,
                          baselineCompanyFeePerCartela:
                            baselineEconomics.companyFeePerCartela,
                        },
                      }
                    : {}),
                });
              }}
              isLoading={createGame.isPending}
              loadingLabel="Adding..."
              disabled={activeGameRules.length === 0}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add to Queue
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Call Number Modal */}
      <Dialog
        open={isCallNumberModalOpen}
        onOpenChange={(open) => {
          setIsCallNumberModalOpen(open);
          if (!open) {
            setCallNumberError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Call Number
              {isAutoCalling && (
                <Badge variant="destructive" className="animate-pulse">
                  Auto Call ON
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {currentGame
                ? currentGame.staticCode
                : "Record the next called number."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[200px_1fr]">
              <div className="flex flex-col items-center rounded-2xl border bg-muted/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Latest called
                </p>
                {liveCalledNumbers.length > 0 ? (
                  <div className="mt-3">
                    <BingoBall
                      letter={liveCalledNumbers.at(-1)!.letter}
                      number={liveCalledNumbers.at(-1)!.number}
                      size="lg"
                      isLatest
                    />
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">None yet</p>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  {displayedCalledCount.toLocaleString()} of 75 called
                </p>
              </div>

              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
                  <div className="space-y-2">
                    <Label>Letter</Label>
                    <Input value={callNumberForm.letter} readOnly />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="called-number">Number</Label>
                    <Input
                      id="called-number"
                      type="number"
                      min={1}
                      max={75}
                      value={String(callNumberForm.number)}
                      onChange={(e) =>
                        setCallNumberForm(
                          toCallNumberPayload(Number(e.target.value)),
                        )
                      }
                      disabled={isAutoCalling}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      const remaining =
                        getRemainingCallNumbersFromList(liveCalledNumbers);
                      const next = getRandomCallNumber(remaining);
                      if (next) {
                        setCallNumberForm(next);
                        setCallNumberError(null);
                      } else {
                        setCallNumberError("All 75 numbers have been called.");
                      }
                    }}
                    disabled={callNumber.isPending || isAutoCalling}
                  >
                    <Target className="mr-2 h-4 w-4" />
                    Pick Random
                  </Button>
                  {isAutoCalling ? (
                    <LoadingButton
                      variant="destructive"
                      onClick={() =>
                        liveSessionId && stopAutoCall.mutate(liveSessionId)
                      }
                      isLoading={stopAutoCall.isPending}
                      loadingLabel="Stopping..."
                      disabled={callNumber.isPending || !liveSessionId}
                    >
                      <PauseCircle className="mr-2 h-4 w-4" />
                      Stop Auto Call
                    </LoadingButton>
                  ) : (
                    <LoadingButton
                      variant="secondary"
                      onClick={() =>
                        liveSessionId && startAutoCall.mutate(liveSessionId)
                      }
                      isLoading={startAutoCall.isPending}
                      loadingLabel="Starting..."
                      disabled={callNumber.isPending || !liveSessionId}
                    >
                      <Radio className="mr-2 h-4 w-4" />
                      Start Auto Call ({autoCallIntervalSec}s)
                    </LoadingButton>
                  )}
                </div>
              </div>
            </div>

            <CalledNumbersStrip
              calledNumbers={displayCalledNumbers}
              compact
              title="Session called numbers"
              isLive={socketConnected && isAutoCalling}
            />

            {callNumberError && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {callNumberError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCallNumberModalOpen(false)}
            >
              Close Panel
            </Button>
            <LoadingButton
              onClick={() => {
                if (
                  liveSessionId &&
                  isValidCalledNumber(callNumberForm.number)
                ) {
                  callNumber.mutate({
                    sessionId: liveSessionId,
                    payload: callNumberForm,
                  });
                }
              }}
              isLoading={callNumber.isPending}
              loadingLabel="Saving..."
              disabled={
                isAutoCalling ||
                !liveSessionId ||
                !isValidCalledNumber(callNumberForm.number)
              }
            >
              <Target className="mr-2 h-4 w-4" />
              Save Number
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(registeredPlayersDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setRegisteredPlayersDialog(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Registered players</DialogTitle>
            <DialogDescription>
              {registeredPlayersDialog?.label
                ? `Cartelas for ${registeredPlayersDialog.label}`
                : "Players and their registered cartelas"}
              {registeredPlayersQuery.data
                ? ` · ${registeredPlayersQuery.data.playersCount} player${
                    registeredPlayersQuery.data.playersCount === 1 ? "" : "s"
                  } · ${registeredPlayersQuery.data.registeredCartelasCount} cartela${
                    registeredPlayersQuery.data.registeredCartelasCount === 1
                      ? ""
                      : "s"
                  }${
                    typeof registeredPlayersQuery.data.registeredByMoneyCount ===
                      "number" ||
                    typeof registeredPlayersQuery.data
                      .registeredByTicketCount === "number"
                      ? ` · ${registeredPlayersQuery.data.registeredByMoneyCount ?? 0} money · ${registeredPlayersQuery.data.registeredByTicketCount ?? 0} ticket${
                          (registeredPlayersQuery.data
                            .registeredByCarriedCount ?? 0) > 0
                            ? ` · ${registeredPlayersQuery.data.registeredByCarriedCount} carried`
                            : ""
                        }`
                      : ""
                  }`
                : null}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {registeredPlayersQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading players…
              </div>
            ) : registeredPlayersQuery.isError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {getApiErrorMessage(registeredPlayersQuery.error) ||
                  "Could not load registered players."}
              </div>
            ) : !registeredPlayersQuery.data?.players.length ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No cartelas registered yet.
              </div>
            ) : (
              <ul className="space-y-3">
                {registeredPlayersQuery.data.players.map((player) => (
                  <li
                    key={player.userId}
                    className="rounded-xl border bg-muted/20 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {player.fullName || "Unknown player"}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3 shrink-0" />
                          <span className="truncate">{player.phoneNumber}</span>
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {player.cartelas.length} cartela
                        {player.cartelas.length === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {player.cartelas.map((cartela) => {
                        const sourceLabel =
                          cartela.paymentSource === "BIG_GAME_TICKET"
                            ? "Ticket"
                            : cartela.paymentSource === "MONEY_WALLET"
                              ? "Money"
                              : cartela.paymentSource === "CARRIED_FORWARD"
                                ? "Carried"
                                : cartela.paymentSource === "BONUS_CARTELA"
                                  ? "Bonus"
                                  : null;
                        return (
                          <Badge
                            key={cartela.gameCartelaId}
                            variant="outline"
                            className="font-mono tabular-nums"
                          >
                            #{cartela.cartelaNumber}
                            {sourceLabel ? ` · ${sourceLabel}` : ""}
                          </Badge>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter className="border-t px-6 py-3">
            <Button
              variant="outline"
              onClick={() => setRegisteredPlayersDialog(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={Boolean(pendingOperationModeSwitch)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingOperationModeSwitch(null);
          }
        }}
        title={
          pendingOperationModeSwitch
            ? getApplyOperationModePrompt(pendingOperationModeSwitch.mode)
            : "Apply operation mode"
        }
        description={
          pendingOperationModeSwitch
            ? getApplyOperationModeDescription(
                pendingOperationModeSwitch.game,
                pendingOperationModeSwitch.mode,
              )
            : "Apply the selected operation mode to the current game."
        }
        confirmLabel="Apply to current game"
        onConfirm={() => {
          if (pendingOperationModeSwitch) {
            applyOperationModeToCurrentGame.mutate({
              slotId: pendingOperationModeSwitch.slotId,
              game: pendingOperationModeSwitch.game,
              mode: pendingOperationModeSwitch.mode,
            });
          }
        }}
        isPending={applyOperationModeToCurrentGame.isPending}
      />

      <ConfirmActionDialog
        open={cancelLiveOpen}
        onOpenChange={setCancelLiveOpen}
        title="Cancel current game"
        description={
          currentGame
            ? `Cancel ${currentGame.staticCode} while it is active. Players will see the session end and the slot moves to the back of the queue.`
            : "Cancel the current game."
        }
        confirmLabel="Cancel game"
        confirmVariant="destructive"
        onConfirm={() => {
          if (!currentGame?.sessionId || cancelLiveSession.isPending) {
            return;
          }
          setCancelLiveOpen(false);
          lockTransitionUi(
            currentGame.sessionId,
            "CANCELLED",
          );
          cancelLiveSession.mutate(currentGame.sessionId);
        }}
        isPending={cancelLiveSession.isPending || transitionLocked}
      />

      <ConfirmActionDialog
        open={Boolean(queuedSlotAction)}
        onOpenChange={(open) => {
          if (!open) {
            setQueuedSlotAction(null);
          }
        }}
        title={
          queuedSlotAction?.mode === "clear"
            ? "Clear from queue"
            : "Cancel game"
        }
        description={
          queuedSlotAction
            ? queuedSlotAction.mode === "clear"
              ? `Remove ${queuedSlotAction.label} from the waiting queue.`
              : (queuedSlotAction.registeredCartelasCount ?? 0) > 0
                ? `Cancel ${queuedSlotAction.label}. ${queuedSlotAction.registeredCartelasCount} registered cartela(s) will be refunded automatically.`
                : `Cancel ${queuedSlotAction.label} and remove it from the queue.`
            : "Update this game."
        }
        confirmLabel={
          queuedSlotAction?.mode === "clear" ? "Clear game" : "Cancel game"
        }
        confirmVariant="destructive"
        onConfirm={() => {
          if (queuedSlotAction) {
            removeQueuedSlot.mutate(queuedSlotAction.slotId);
          }
        }}
        isPending={removeQueuedSlot.isPending}
      />

      <ConfirmActionDialog
        open={Boolean(approveClaimTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setApproveClaimTarget(null);
          }
        }}
        title="Approve bingo claim"
        description={
          approveClaimTarget
            ? `Approve cartela #${approveClaimTarget.gameCartela?.cartela?.number} and finish the game with prize payout.`
            : "Approve this bingo claim."
        }
        confirmLabel="Approve claim"
        onConfirm={() => {
          if (approveClaimTarget) {
            approveClaim.mutate(approveClaimTarget.id);
          }
        }}
        isPending={approveClaim.isPending}
      />

      <ConfirmActionDialog
        open={clearQueueOpen}
        onOpenChange={setClearQueueOpen}
        title="Clear waiting queue"
        description={clearQueueConfirmDescription}
        confirmLabel="Clear waiting queue"
        confirmVariant="destructive"
        onConfirm={() => {
          clearQueue.mutate(undefined);
        }}
        isPending={clearQueue.isPending}
      />

      <ConfirmActionDialog
        open={Boolean(rejectClaimTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setRejectClaimTarget(null);
          }
        }}
        title="Reject bingo claim"
        description={
          rejectClaimTarget
            ? `Reject cartela #${rejectClaimTarget.gameCartela?.cartela?.number}. The cartela will be blocked from claiming again.`
            : "Reject this bingo claim."
        }
        confirmLabel="Reject claim"
        confirmVariant="destructive"
        field={{
          label: "Rejection reason",
          placeholder: "Explain why this claim is being rejected",
          required: true,
        }}
        onConfirm={(value) => {
          if (!rejectClaimTarget || !value?.trim()) {
            return;
          }

          rejectClaim.mutate({
            claimId: rejectClaimTarget.id,
            reason: value.trim(),
          });
        }}
        isPending={rejectClaim.isPending}
      />
    </div>
  );
}

function GameOperationsSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2].map((item) => (
        <Card key={item}>
          <CardContent className="space-y-4 p-6">
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
            <div className="h-4 w-64 animate-pulse rounded bg-muted" />
            <div className="grid gap-3 md:grid-cols-3">
              <div className="h-24 animate-pulse rounded-xl bg-muted" />
              <div className="h-24 animate-pulse rounded-xl bg-muted" />
              <div className="h-24 animate-pulse rounded-xl bg-muted" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function getBallColor(letter: string): string {
  switch (letter.toUpperCase()) {
    case "B":
      return "bg-red-500";
    case "I":
      return "bg-blue-500";
    case "N":
      return "bg-emerald-600";
    case "G":
      return "bg-amber-500";
    case "O":
      return "bg-violet-500";
    default:
      return "bg-slate-500";
  }
}

function BingoBall({
  letter,
  number,
  size = "sm",
  isLatest = false,
}: {
  letter: string;
  number: number;
  size?: "sm" | "lg";
  isLatest?: boolean;
}) {
  const isLarge = size === "lg";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-full font-bold text-white shadow-md",
        getBallColor(letter),
        isLarge ? "h-16 w-16" : "h-8 w-8",
        isLatest && "ring-2 ring-offset-2 ring-foreground/70",
      )}
      title={`${letter}-${number}`}
    >
      <span
        className={cn(
          "leading-none opacity-90",
          isLarge ? "text-xs" : "text-[9px]",
        )}
      >
        {letter}
      </span>
      <span className={cn("leading-none", isLarge ? "text-xl" : "text-xs")}>
        {number}
      </span>
    </div>
  );
}

function CalledNumbersStrip({
  calledNumbers,
  compact = false,
  title = "Called this session",
  isLive = false,
}: {
  calledNumbers: CalledNumber[];
  compact?: boolean;
  title?: string;
  isLive?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);

  if (calledNumbers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-white/70 px-4 py-3 text-sm text-muted-foreground">
        {title}: no numbers called yet.
      </div>
    );
  }

  const sorted = [...calledNumbers].sort(
    (left, right) => left.order - right.order,
  );
  const latest = sorted.at(-1)!;
  const recent = sorted.slice(-9, -1).reverse();
  const latestId = latest.id;

  return (
    <div className="rounded-lg border bg-white/80 px-4 py-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <div className="flex items-center gap-2">
          {isLive ? (
            <Badge
              variant="outline"
              className="border-emerald-300 bg-emerald-50 text-[10px] uppercase tracking-wide text-emerald-700"
            >
              Live
            </Badge>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {sorted.length} balls
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex shrink-0 flex-col items-center">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Latest · #{latest.order}
          </p>
          <BingoBall
            letter={latest.letter}
            number={latest.number}
            size="lg"
            isLatest
          />
        </div>

        {recent.length > 0 ? (
          <div className="min-w-0 flex-1">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Recent
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {recent.map((calledNumber) => (
                <div
                  key={calledNumber.id}
                  className="flex shrink-0 flex-col items-center gap-1"
                >
                  <BingoBall
                    letter={calledNumber.letter}
                    number={calledNumber.number}
                    isLatest={calledNumber.id === latestId}
                  />
                  <span className="text-[9px] text-muted-foreground">
                    #{calledNumber.order}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {sorted.length > 1 ? (
        <div className="mt-3 border-t pt-3">
          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline"
            onClick={() => setShowAll((value) => !value)}
          >
            {showAll ? "Hide full board" : `Show all ${sorted.length} balls`}
          </button>
          {showAll ? (
            <div
              className={cn(
                "mt-2 flex flex-wrap gap-2",
                compact && "max-h-28 overflow-y-auto pr-1",
              )}
            >
              {sorted.map((calledNumber) => (
                <BingoBall
                  key={calledNumber.id}
                  letter={calledNumber.letter}
                  number={calledNumber.number}
                  isLatest={calledNumber.id === latestId}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function QueueOrderButtons({
  slotId,
  reorderableSlots,
  onMove,
  reorderAction,
  isReordering = false,
}: {
  slotId: string;
  reorderableSlots: Array<{ slotId: string }>;
  onMove: (slotId: string, direction: "up" | "down") => void;
  reorderAction: { slotId: string; direction: "up" | "down" } | null;
  isReordering?: boolean;
}) {
  const currentIndex = reorderableSlots.findIndex(
    (slot) => slot.slotId === slotId,
  );
  const isMovingUp =
    isReordering &&
    reorderAction?.slotId === slotId &&
    reorderAction.direction === "up";
  const isMovingDown =
    isReordering &&
    reorderAction?.slotId === slotId &&
    reorderAction.direction === "down";

  return (
    <div className="flex items-center gap-1">
      <LoadingButton
        variant="ghost"
        size="icon"
        onClick={() => onMove(slotId, "up")}
        disabled={currentIndex <= 0 || isReordering}
        isLoading={isMovingUp}
        loadingLabel=""
        title="Move up"
      >
        <ArrowUp className="h-4 w-4" />
      </LoadingButton>
      <LoadingButton
        variant="ghost"
        size="icon"
        onClick={() => onMove(slotId, "down")}
        disabled={
          currentIndex < 0 ||
          currentIndex >= reorderableSlots.length - 1 ||
          isReordering
        }
        isLoading={isMovingDown}
        loadingLabel=""
        title="Move down"
      >
        <ArrowDown className="h-4 w-4" />
      </LoadingButton>
    </div>
  );
}

/**
 * Per-round prize + game rule grid, shared by Big Game and Chain Game. The two
 * categories differ only in their inter-round delay bounds, so those are props.
 */
function RoundConfigEditor({
  idPrefix,
  roundPrizes,
  roundRuleIds,
  fallbackRuleId,
  activeGameRules,
  interRoundDelaySeconds,
  minDelaySeconds,
  maxDelaySeconds,
  delayHelpText,
  onRoundPrizeChange,
  onRoundRuleChange,
  onInterRoundDelayChange,
  hideInterRoundDelay = false,
}: {
  idPrefix: string;
  roundPrizes: string[];
  roundRuleIds: string[];
  fallbackRuleId: string;
  activeGameRules: GameRuleSummary[];
  /** Required when delay UI is shown (Chain Game). Unused for Big Game. */
  interRoundDelaySeconds?: string;
  minDelaySeconds?: number;
  maxDelaySeconds?: number;
  delayHelpText?: string;
  onRoundPrizeChange: (index: number, value: string) => void;
  onRoundRuleChange: (index: number, value: string) => void;
  onInterRoundDelayChange?: (value: string) => void;
  hideInterRoundDelay?: boolean;
}) {
  return (
    <>
      {!hideInterRoundDelay &&
      interRoundDelaySeconds != null &&
      minDelaySeconds != null &&
      maxDelaySeconds != null &&
      onInterRoundDelayChange ? (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-inter-round-delay`}>
            Inter-round delay (seconds)
          </Label>
          <Input
            id={`${idPrefix}-inter-round-delay`}
            type="number"
            min={minDelaySeconds}
            max={maxDelaySeconds}
            value={interRoundDelaySeconds}
            onChange={(event) => onInterRoundDelayChange(event.target.value)}
          />
          {delayHelpText ? (
            <p className="text-xs text-muted-foreground">{delayHelpText}</p>
          ) : null}
        </div>
      ) : null}
      <div className="space-y-3 sm:col-span-2">
        <Label>Round prize and game rule</Label>
        <div className="grid gap-3">
          {roundPrizes.map((prize, index) => (
            <div
              key={`${idPrefix}-round-config-${index}`}
              className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2"
            >
              <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-round-prize-${index}`}>
                  Round {index + 1} prize
                </Label>
                <Input
                  id={`${idPrefix}-round-prize-${index}`}
                  inputMode="decimal"
                  placeholder="0"
                  value={prize}
                  onChange={(event) =>
                    onRoundPrizeChange(index, event.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-round-rule-${index}`}>
                  Round {index + 1} game rule
                </Label>
                <Select
                  value={roundRuleIds[index] || fallbackRuleId || ""}
                  onValueChange={(value) => onRoundRuleChange(index, value)}
                >
                  <SelectTrigger
                    id={`${idPrefix}-round-rule-${index}`}
                    className="w-full"
                  >
                    <SelectValue placeholder="Select rule" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="z-[100] max-h-60">
                    {activeGameRules.map((rule) => (
                      <SelectItem key={rule.id} value={rule.id}>
                        {rule.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function NormalEconomicsEditor({
  entryFee,
  companyFeePerCartela,
  prizePerCartela,
  onEntryFeeChange,
  onCommissionChange,
}: {
  entryFee: string;
  companyFeePerCartela: string;
  prizePerCartela: string;
  onEntryFeeChange: (value: string) => void;
  onCommissionChange: (value: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Economics</p>
        <p className="text-sm text-muted-foreground">
          Prefilled from Time Config. Saving this game also updates Time Config
          defaults for future normal games.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="normal-create-entry-fee">Entry fee (ETB)</Label>
          <Input
            id="normal-create-entry-fee"
            inputMode="decimal"
            value={entryFee}
            onChange={(event) => onEntryFeeChange(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="normal-create-commission">Commission (ETB)</Label>
          <Input
            id="normal-create-commission"
            inputMode="decimal"
            value={companyFeePerCartela}
            onChange={(event) => onCommissionChange(event.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Prize / cartela (calculated)
        </p>
        <p className="text-lg font-semibold text-blue-700">
          {formatCurrency(prizePerCartela)}
        </p>
      </div>
    </div>
  );
}

function EntryFeeEditor({
  slotId,
  currentFee,
  canEdit,
  isEditing,
  draftValue,
  isSaving,
  registeredCartelasCount,
  onStartEdit,
  onDraftChange,
  onSave,
  onCancel,
  valueClassName = "text-blue-700",
}: {
  slotId: string;
  currentFee: string;
  canEdit: boolean;
  isEditing: boolean;
  draftValue: string;
  isSaving: boolean;
  registeredCartelasCount: number;
  onStartEdit: (
    slotId: string,
    currentFee: string,
    registeredCartelasCount: number,
  ) => void;
  onDraftChange: (value: string) => void;
  onSave: (slotId: string, registeredCartelasCount: number) => void;
  onCancel: () => void;
  valueClassName?: string;
}) {
  if (!isEditing) {
    return (
      <div className="flex flex-col items-center gap-2">
        <span className={cn("text-2xl font-bold", valueClassName)}>
          {formatCurrency(currentFee)}
        </span>
        {canEdit ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              onStartEdit(slotId, currentFee, registeredCartelasCount)
            }
          >
            Edit
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={8}
          step="1"
          value={draftValue}
          className="h-9 w-24"
          autoFocus
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onSave(slotId, registeredCartelasCount);
            }
          }}
        />
        <span className="text-sm">ETB</span>
      </div>
      <div className="flex gap-2">
        <LoadingButton
          type="button"
          size="sm"
          onClick={() => onSave(slotId, registeredCartelasCount)}
          isLoading={isSaving}
          loadingLabel="Saving..."
        >
          Save
        </LoadingButton>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function RegistrationStatCard({
  label,
  value,
  hint,
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-2">{value}</div>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="rounded-xl border border-blue-100 bg-white/90 p-4 text-center shadow-sm transition hover:border-blue-300 hover:bg-blue-50/70"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-blue-100 bg-white/90 p-4 text-center shadow-sm">
      {content}
    </div>
  );
}

// Helper functions for Call Number modal
function toCallNumberPayload(number: number): CallNumberPayload {
  return {
    letter: getLetterForNumber(number),
    number,
  };
}

function getLetterForNumber(number: number): CallNumberPayload["letter"] {
  if (number >= 1 && number <= 15) return "B";
  if (number >= 16 && number <= 30) return "I";
  if (number >= 31 && number <= 45) return "N";
  if (number >= 46 && number <= 60) return "G";
  return "O";
}

function getRemainingCallNumbersFromList(
  calledNumbers: CalledNumber[],
): number[] {
  const used = new Set(
    calledNumbers.map((calledNumber) => calledNumber.number),
  );
  return Array.from({ length: 75 }, (_, index) => index + 1).filter(
    (number) => !used.has(number),
  );
}

function getRandomCallNumber(remaining: number[]): CallNumberPayload | null {
  if (remaining.length === 0) return null;
  const num = remaining[Math.floor(Math.random() * remaining.length)];
  return toCallNumberPayload(num);
}

function isValidCalledNumber(n: number): boolean {
  return n >= 1 && n <= 75;
}

function OperationModeAndRuleLabels({
  operationMode,
  gameRuleKey,
  gameRuleName,
}: {
  operationMode: GameOperationMode;
  gameRuleKey?: string | null;
  gameRuleName?: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge
        variant="outline"
        className={cn(
          operationMode === "AUTO"
            ? "border-blue-300 bg-blue-50 text-blue-800"
            : "border-slate-300 bg-slate-50 text-slate-700",
        )}
      >
        {operationMode === "AUTO" ? "Automatic" : "Manual"}
      </Badge>
      <Badge
        variant="outline"
        className="border-violet-300 bg-violet-50 text-violet-800"
      >
        {gameRuleName || gameRuleKey || "Unknown"}
      </Badge>
    </div>
  );
}

function OperationModeHeaderControl({
  value,
  onChange,
  focusedGameLabel,
  isLoading = false,
}: {
  value: GameOperationMode;
  onChange: (mode: GameOperationMode) => void;
  focusedGameLabel?: string | null;
  isLoading?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Operation mode</Label>
      {focusedGameLabel ? (
        <p className="text-xs text-muted-foreground">{focusedGameLabel}</p>
      ) : null}
      <div
        className={cn(
          "inline-flex rounded-lg border p-1",
          value === "AUTO"
            ? "border-blue-200 bg-blue-50/60"
            : "border-slate-200 bg-slate-50/80",
          isLoading && "pointer-events-none opacity-70",
        )}
      >
        <OperationModeSegmentButton
          mode="MANUAL"
          active={value === "MANUAL"}
          label="Manual"
          disabled={isLoading}
          onClick={() => onChange("MANUAL")}
        />
        <OperationModeSegmentButton
          mode="AUTO"
          active={value === "AUTO"}
          label="Automatic"
          disabled={isLoading}
          onClick={() => onChange("AUTO")}
        />
      </div>
    </div>
  );
}

function OperationModeSegmentButton({
  mode,
  active,
  label,
  disabled = false,
  onClick,
}: {
  mode: GameOperationMode;
  active: boolean;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        mode === "MANUAL" &&
          (active
            ? "bg-slate-700 text-white shadow-sm"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"),
        mode === "AUTO" &&
          (active
            ? "bg-blue-600 text-white shadow-sm"
            : "text-blue-600/70 hover:bg-blue-100 hover:text-blue-800"),
      )}
    >
      {label}
    </button>
  );
}
