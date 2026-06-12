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
  createAdminGame,
  updateAdminSlotOperationMode,
  getAdminBingoClaims,
  getAdminGameRules,
  getAdminTimeConfig,
  getCurrentGameOperations,
  getGameCalledNumbers,
  rejectAdminBingoClaim,
  reorderAdminSlots,
  startAdminGame,
  startSessionAutoCall,
  stopSessionAutoCall,
  updateAdminGameStatus,
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
  getApplyOperationModeDescription,
  buildOperationModeSwitchPayload,
  getApplyOperationModePrompt,
  getCreateFormDefaults,
  getFocusedGameForModeSwitch,
  readStoredDefaultOperationMode,
  resolveAutoCallIntervalMs,
  shouldPromptApplyModeToCurrentGame,
  type TimingConfigLike,
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
  GameOperationMode,
} from "@/lib/api/types";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  bingoClaimsQueryKey,
  calledNumbersQueryKey,
  type CalledNumbersCache,
  createOptimisticCalledNumber,
  dropTerminalSessionFromOperationsCache,
  invalidateOperationsCache,
  isCalledNumberForActiveSession,
  isTerminalGameStatus,
  logCalledNumberEvent,
  mergeCalledNumbersResponse,
  normalizeCalledNumberPayload,
  operationsQueryKey,
  refetchCalledNumbersForSession,
  optimisticallyPatchEntryFee,
  optimisticallyRemoveBingoClaim,
  optimisticallyReorderQueue,
  applyRealtimeCalledNumber,
  patchOperationsCache,
  readLiveCalledNumbers,
} from "@/lib/admin/game-operations-cache";
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
import { PageHeader } from "@/components/admin/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FALLBACK_OPERATIONS_INVALIDATE_DEBOUNCE_MS = 2500;
const FALLBACK_OPERATIONS_POLLING_MS = 5000;
const timeConfigQueryKey = ["admin", "time-config"] as const;

export function GameOperations() {
  const queryClient = useQueryClient();
  const [selectedGameForEdit, setSelectedGameForEdit] = useState<string | null>(null);
  const [entryFeeDrafts, setEntryFeeDrafts] = useState<Record<string, string>>({});
  const [entryFeeError, setEntryFeeError] = useState<string | null>(null);
  const [isCreateGameModalOpen, setIsCreateGameModalOpen] = useState(false);
  const [selectedRuleId, setSelectedRuleId] = useState("");
  const [createOperationMode, setCreateOperationMode] =
    useState<GameOperationMode>("MANUAL");
  const [createRegistrationDurationSeconds, setCreateRegistrationDurationSeconds] =
    useState("");
  const [createAutoCallIntervalSeconds, setCreateAutoCallIntervalSeconds] =
    useState("");
  const [createGameError, setCreateGameError] = useState<string | null>(null);
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
  const [cancelQueuedTarget, setCancelQueuedTarget] = useState<{
    slotId: string;
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
  const [calledNumbersRevision, setCalledNumbersRevision] = useState(0);
  const bumpCalledNumbersRevision = useCallback(() => {
    setCalledNumbersRevision((revision) => revision + 1);
  }, []);

  const { data: timeConfig } = useQuery({
    queryKey: timeConfigQueryKey,
    queryFn: getAdminTimeConfig,
    staleTime: 30_000,
  });

  const operationsInvalidateDebounceMs =
    timeConfig?.adminRefreshDebounceMs ??
    FALLBACK_OPERATIONS_INVALIDATE_DEBOUNCE_MS;
  const operationsFallbackPollingMs =
    (timeConfig?.adminFallbackPollingSeconds ?? 5) * 1000;

  // CANONICAL: Use backend's single source of truth endpoint
  // Backend decides which game is live/checking/registration/queue
  const {
    data: operations,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: operationsQueryKey,
    queryFn: getCurrentGameOperations,
    refetchOnWindowFocus: true,
    staleTime: 2_000,
    refetchInterval: false,
    placeholderData: keepPreviousData,
    retry: (failureCount, queryError) => {
      if (queryError instanceof ApiError && queryError.statusCode === 429) {
        return false;
      }

      return failureCount < 1;
    },
  });

  // Extract canonical sections from backend response
  const liveGame = operations?.liveGame;
  const checkingGame = operations?.checkingGame;
  const registrationOpenGame = operations?.registrationOpenGame;
  const queue = operations?.queue ?? [];
  const currentGame = liveGame ?? checkingGame ?? null;
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
  const focusedGame = useMemo(
    () =>
      getFocusedGameForModeSwitch({
        liveGame: liveGame ?? null,
        checkingGame: checkingGame ?? null,
        registrationOpenGame: registrationOpenGame ?? null,
      }),
    [liveGame, checkingGame, registrationOpenGame],
  );
  const headerOperationMode =
    pendingOperationModeSwitch?.mode ??
    focusedGame?.operationMode ??
    defaultOperationMode;
  const currentSessionId = currentGame?.sessionId ?? null;
  const liveSessionId = currentSessionId;
  const pollOperationsFallback = !socketConnected;
  const isRateLimited = isApiRateLimitError(error);
  const invalidateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const liveSessionIdRef = useRef(liveSessionId);
  liveSessionIdRef.current = liveSessionId;
  const previousLiveSessionIdRef = useRef<string | null>(null);

  const scheduleOperationsRefresh = useCallback(
    (immediate = false) => {
      if (invalidateDebounceRef.current) {
        clearTimeout(invalidateDebounceRef.current);
        invalidateDebounceRef.current = null;
      }

      const refresh = () => {
        invalidateOperationsCache(queryClient);
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

  useEffect(() => {
    return socketService.onConnectionChange(setSocketConnected);
  }, []);

  useEffect(() => {
    if (!pollOperationsFallback) {
      return;
    }

    const timer = window.setInterval(() => {
      void refetch();
    }, operationsFallbackPollingMs);

    return () => window.clearInterval(timer);
  }, [operationsFallbackPollingMs, pollOperationsFallback, refetch]);

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
    refetchInterval: pollOperationsFallback ? operationsFallbackPollingMs : false,
  });

  useEffect(() => {
    if (liveCalledNumbersData) {
      bumpCalledNumbersRevision();
    }
  }, [liveCalledNumbersData, bumpCalledNumbersRevision]);

  const liveCalledNumbers = useMemo(
    () => readLiveCalledNumbers(queryClient, liveSessionId),
    [queryClient, liveSessionId, calledNumbersRevision, liveCalledNumbersData],
  );
  const latestCalledNumber = useMemo(() => {
    const lastFromList = liveCalledNumbers.at(-1);
    if (lastFromList) {
      return lastFromList;
    }

    return currentGame?.latestCalledNumber ?? null;
  }, [liveCalledNumbers, currentGame?.latestCalledNumber]);
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

  const registrationScheduledStartAt =
    registrationOpenGame?.scheduledStartAt ?? null;
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
    registrationOpenGame != null &&
    registrationOpenGame.slotId !== currentGame?.slotId;

  const reorderableSlots = useMemo(() => {
    const slots = [
      ...(registrationOpenGame ? [registrationOpenGame] : []),
      ...queue,
    ];

    return slots.sort(
      (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0),
    );
  }, [registrationOpenGame, queue]);

  const { data: gameRules = [] } = useQuery({
    queryKey: ["admin", "game-rules"],
    queryFn: getAdminGameRules,
    enabled: isCreateGameModalOpen,
  });

  const activeGameRules = gameRules.filter((rule) => rule.isActive !== false);

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

  // Fetch pending bingo claims for the checking game
  const { data: bingoClaims } = useQuery({
    queryKey: bingoClaimsQueryKey,
    queryFn: async () => {
      const response = await getAdminBingoClaims(1, 10);
      return response.items.filter((c: AdminBingoClaim) => c.status === "PENDING");
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
      const calledNumber = normalizeCalledNumberPayload(payload);
      const activeSessionId = liveSessionIdRef.current;
      if (
        calledNumber == null ||
        activeSessionId == null ||
        !isCalledNumberForActiveSession(calledNumber, activeSessionId)
      ) {
        return;
      }

      logCalledNumberEvent(calledNumber);
      applyRealtimeCalledNumber(queryClient, activeSessionId, calledNumber);
      bumpCalledNumbersRevision();
    };

    const handleReconnectRefresh = () => {
      refetchCalledNumbersForSession(queryClient, liveSessionIdRef.current);
      scheduleOperationsRefresh(true);
    };

    const handleStructuralRefresh = (payload: unknown) => {
      // Legacy guard: API no longer emits operation_updated per ball (PR1).
      if (
        payload &&
        typeof payload === "object" &&
        "updatedReason" in payload
      ) {
        const reason = (payload as { updatedReason?: string }).updatedReason;
        if (reason === "number_called") {
          return;
        }

        if (reason === "auto_call_changed") {
          const data = payload as {
            sessionId?: string | null;
            slotId?: string | null;
            autoCallEnabled?: boolean;
            autoCallIntervalMs?: number | null;
            nextAutoCallAt?: string | null;
          };
          patchOperationsCache(queryClient, {
            sessionId: data.sessionId ?? undefined,
            slotId: data.slotId ?? undefined,
            autoCallEnabled: data.autoCallEnabled,
            autoCallIntervalMs: data.autoCallIntervalMs,
            nextAutoCallAt: data.nextAutoCallAt,
          });
          return;
        }
      }

      scheduleOperationsRefresh(false);
    };

    const handleTerminalSession = (payload: unknown) => {
      if (payload && typeof payload === "object") {
        const data = payload as {
          sessionId?: string | null;
          id?: string | null;
          slotId?: string | null;
          gameSlotId?: string | null;
        };
        dropTerminalSessionFromOperationsCache(queryClient, {
          sessionId: data.sessionId ?? data.id ?? null,
          slotId: data.slotId ?? data.gameSlotId ?? null,
        });
      }

      scheduleOperationsRefresh(true);
    };

    const handleGameCancelled = (payload: unknown) => {
      if (payload && typeof payload === "object") {
        const data = payload as {
          reason?: string | null;
          refundedCount?: number | null;
        };

        if (data.reason === "no_players") {
          adminToast.info("Skipped — no players joined.");
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
          ? (payload as { status?: string | null }).status
          : null;

      if (isTerminalGameStatus(status)) {
        handleTerminalSession(payload);
        return;
      }

      handleStructuralRefresh(payload);
    };

    socketService.on("connect", handleReconnectRefresh);
    socketService.on("game:status_changed", handleStatusChanged);
    socketService.on("game:operation_updated", handleStructuralRefresh);
    socketService.on("game:number_called", handleNumberCalled);
    socketService.on("game:bingo_claimed", handleStructuralRefresh);
    socketService.on("game:winner_window_started", handleStructuralRefresh);
    socketService.on("game:winner_window_joined", handleStructuralRefresh);
    socketService.on("game:finished", handleTerminalSession);
    socketService.on("game:cancelled", handleGameCancelled);
    socketService.on("session:prize_updated", handleStructuralRefresh);
    socketService.on("session:cartelas_updated", handleStructuralRefresh);
    socketService.on("slot:status_changed", handleStructuralRefresh);
    socketService.on("slot:entry_fee_updated", handleStructuralRefresh);

    return () => {
      if (invalidateDebounceRef.current) {
        clearTimeout(invalidateDebounceRef.current);
      }

      socketService.off("connect", handleReconnectRefresh);
      socketService.off("game:status_changed", handleStatusChanged);
      socketService.off("game:operation_updated", handleStructuralRefresh);
      socketService.off("game:number_called", handleNumberCalled);
      socketService.off("game:bingo_claimed", handleStructuralRefresh);
      socketService.off("game:winner_window_started", handleStructuralRefresh);
      socketService.off("game:winner_window_joined", handleStructuralRefresh);
      socketService.off("game:finished", handleTerminalSession);
      socketService.off("game:cancelled", handleGameCancelled);
      socketService.off("session:prize_updated", handleStructuralRefresh);
      socketService.off("session:cartelas_updated", handleStructuralRefresh);
      socketService.off("slot:status_changed", handleStructuralRefresh);
      socketService.off("slot:entry_fee_updated", handleStructuralRefresh);
    };
  }, [queryClient, bumpCalledNumbersRevision, scheduleOperationsRefresh]);

  useEffect(() => {
    setDefaultOperationMode(readStoredDefaultOperationMode(window.localStorage));
  }, []);

  const openCreateGameModal = () => {
    setCreateGameError(null);
    const defaults = getCreateFormDefaults(defaultOperationMode, timeConfig);
    setCreateOperationMode(defaults.operationMode);
    setCreateRegistrationDurationSeconds(defaults.registrationDurationSeconds);
    setCreateAutoCallIntervalSeconds(defaults.autoCallIntervalSeconds);
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
    mutationFn: (payload: CreateGamePayload) =>
      createAdminGame(buildCreateGameRequestBody(payload)),
    successMessage: "Game added to queue.",
    errorMessage: "Could not add the game to the queue.",
    invalidateQueryKeys: [],
    onSuccess: () => {
      setIsCreateGameModalOpen(false);
      setCreateGameError(null);
      scheduleOperationsRefresh(true);
    },
    onError: (error) => {
      setCreateGameError(
        getApiErrorMessage(error, "Could not add the game to the queue."),
      );
    },
  });

  const startGame = useAdminMutation({
    mutationFn: (gameId: string) => startAdminGame(gameId),
    successMessage: "Game started.",
    errorMessage: "Failed to start game.",
    invalidateQueryKeys: [],
    onSuccess: () => {
      scheduleOperationsRefresh(true);
    },
  });

  const cancelLiveSession = useAdminMutation({
    mutationFn: (sessionId: string) => cancelBlockingSession(sessionId),
    errorMessage: "Failed to cancel live game.",
    invalidateQueryKeys: [],
    onSuccess: (data) => {
      if (!data.alreadyCancelled) {
        adminToast.success("Live game cancelled.");
      }
      scheduleOperationsRefresh(true);
    },
  });

  const cancelQueuedSlot = useAdminMutation({
    mutationFn: (slotId: string) =>
      updateAdminGameStatus(slotId, { status: "CANCELLED" }),
    successMessage: "Queued game cancelled.",
    errorMessage: "Failed to cancel queued game.",
    invalidateQueryKeys: [],
    onSuccess: () => {
      setCancelQueuedTarget(null);
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
        queryClient.getQueryData<GameOperationsCurrentResponse>(operationsQueryKey);
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
        queryClient.setQueryData(operationsQueryKey, context.previousOperations);
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
      setCallNumberError(getApiErrorMessage(error, "Failed to start auto-call"));
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
      previousOperations: optimisticallyPatchEntryFee(queryClient, gameId, entryFee),
    }),
    onSuccess: (_, { gameId }) => {
      setSelectedGameForEdit(null);
      setEntryFeeError(null);
      setEntryFeeDrafts((current) => {
        const next = { ...current };
        delete next[gameId];
        return next;
      });
      scheduleOperationsRefresh(true);
    },
    onError: (error, _variables, context) => {
      if (context?.previousOperations) {
        queryClient.setQueryData(operationsQueryKey, context.previousOperations);
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
        queryClient.setQueryData(operationsQueryKey, context.previousOperations);
      }
    },
    onSettled: () => {
      setReorderAction(null);
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

  if (isLoading && !operations) {
    return <GameOperationsSkeleton />;
  }

  if (error && !operations && !isRateLimited) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        <p className="font-medium">Failed to load game operations</p>
        <p className="text-sm">{getApiErrorMessage(error)}</p>
        <Button onClick={() => refetch()} className="mt-2" variant="outline" size="sm">
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
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Game Operations"
          description="Manage live games, registrations, and queue"
          className="hidden sm:block"
        />

        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
          <OperationModeHeaderControl
            value={headerOperationMode}
            onChange={handleDefaultOperationModeChange}
            isLoading={applyOperationModeToCurrentGame.isPending}
            focusedGameLabel={
              focusedGame?.playCode ?? focusedGame?.staticCode ?? null
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

      {/* A. CURRENT GAME — live, winner window, or checking */}
      {currentGame && (
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Radio className="h-5 w-5 animate-pulse text-green-600" />
                <CardTitle className="text-green-900">Current Game</CardTitle>
                <Badge className="bg-green-100 text-green-800">
                  {currentGame.playerStatus === "winnerWindow"
                    ? "WINNER WINDOW"
                    : currentGame.playerStatus === "checking"
                      ? "CHECKING"
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
                  disabled={!currentGame.sessionId}
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
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {isAutoCalling ? (
                <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">
                  {nextAutoCallSeconds !== null
                    ? `Next ball in ${nextAutoCallSeconds}s`
                    : "Auto-call on"}
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
                <div className="rounded-lg border bg-white p-4 text-center">
                  <p className="text-sm text-muted-foreground">Players</p>
                  <p className="mt-1 text-2xl font-bold text-primary">
                    {currentGame.registeredCartelasCount}
                  </p>
                </div>
                <div className="rounded-lg border bg-white p-4 text-center">
                  <p className="text-sm text-muted-foreground">Prize pool</p>
                  <p className="mt-1 text-2xl font-bold text-primary">
                    {formatCurrency(currentGame.prizeAmount)}
                  </p>
                </div>
              </div>
            </div>

            {currentGame.playerStatus !== "checking" ? (
              <CalledNumbersStrip
                calledNumbers={
                  liveCalledNumbers.length > 0
                    ? liveCalledNumbers
                    : latestCalledNumber
                      ? [
                          {
                            id: `latest-${latestCalledNumber.order}`,
                            gameSessionId: liveSessionId ?? "",
                            letter: latestCalledNumber.letter,
                            number: latestCalledNumber.number,
                            order: latestCalledNumber.order,
                            createdAt: new Date().toISOString(),
                          },
                        ]
                      : []
                }
              />
            ) : null}

            {isWinnerWindow && currentGame.winnerWindowEndsAt && (
              <div className="rounded-lg border border-violet-300 bg-violet-50 px-4 py-3 text-violet-900">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">Winner window open</p>
                    {(currentGame.winnerPayoutsSummary?.length ?? 0) > 0 ? (
                      <div className="mt-3 space-y-1">
                        <p className="text-sm font-medium text-violet-900">
                          Winners per cartela
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {(currentGame.winnerPayoutsSummary ?? []).map(
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
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-violet-800">
                        No winner cartelas recorded yet.
                      </p>
                    )}
                  </div>
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

            {currentGame.playerStatus !== "checking" ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                {currentGame.operationMode === "MANUAL" || !isAutoCalling ? (
                  <Button
                    onClick={() => setIsCallNumberModalOpen(true)}
                    disabled={!liveSessionId}
                    className="flex-1"
                    size="lg"
                    variant={
                      currentGame.operationMode === "AUTO" ? "outline" : "default"
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
      {showNextRegistration && registrationOpenGame && (
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50/80 to-slate-50">
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Clock3 className="h-5 w-5 text-blue-600" />
                  <CardTitle className="text-blue-950">
                    {currentGame
                      ? "Next round registration"
                      : "Registration open"}
                  </CardTitle>
                  <Badge className="bg-blue-100 text-blue-800">
                    {registrationOpenGame.rawStatus === "NEXT" ? "NEW" : "READY"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {registrationOpenGame.staticCode}
                  {registrationOpenGame.playCode && ` / ${registrationOpenGame.playCode}`}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <QueueOrderButtons
                  slotId={registrationOpenGame.slotId}
                  reorderableSlots={reorderableSlots}
                  onMove={handleReorder}
                  reorderAction={reorderAction}
                  isReordering={reorderSlots.isPending}
                />
                <LoadingButton
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCancelQueuedTarget({
                      slotId: registrationOpenGame.slotId,
                      label: registrationOpenGame.staticCode,
                    })
                  }
                  isLoading={isMutationPendingFor(
                    cancelQueuedSlot,
                    registrationOpenGame.slotId,
                  )}
                  loadingLabel="Cancelling..."
                  className="border-red-200 bg-white text-red-600 hover:bg-red-50"
                >
                  <Ban className="mr-2 h-4 w-4" />
                  Cancel
                </LoadingButton>
                {registrationOpenGame.operationMode === "AUTO" ? null : (
                  // Manual Start is hidden for AUTO. Backend still allows
                  // POST /admin/slots/:id/start as an emergency override.
                  <LoadingButton
                    size="sm"
                    onClick={() => startGame.mutate(registrationOpenGame.slotId)}
                    isLoading={isMutationPendingFor(
                      startGame,
                      registrationOpenGame.slotId,
                    )}
                    loadingLabel="Starting..."
                    disabled={!!currentGame}
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
            <p className="text-sm text-muted-foreground">
              {registrationOpenGame.staticCode}
              {registrationOpenGame.playCode && ` / ${registrationOpenGame.playCode}`}
            </p>
            <OperationModeAndRuleLabels
              operationMode={registrationOpenGame.operationMode}
              gameRuleKey={registrationOpenGame.gameRule?.key}
              gameRuleName={registrationOpenGame.gameRule?.name}
            />
            {registrationOpenGame.operationMode === "AUTO" &&
            registrationSecondsLeft != null &&
            registrationSecondsLeft > 0 ? (
              <RegistrationCountdown
                secondsLeft={registrationSecondsLeft}
                preparing={
                  currentGame?.slotId === registrationOpenGame.slotId &&
                  (currentGame.playerStatus === "playing" ||
                    currentGame.playerStatus === "winnerWindow")
                }
              />
            ) : null}
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              <RegistrationStatCard
                label="Entry Fee"
                value={
                  <EntryFeeEditor
                    slotId={registrationOpenGame.slotId}
                    currentFee={registrationOpenGame.entryFee}
                    canEdit={canEditEntryFee(
                      registrationOpenGame.registeredCartelasCount,
                    )}
                    isEditing={selectedGameForEdit === registrationOpenGame.slotId}
                    draftValue={
                      entryFeeDrafts[registrationOpenGame.slotId] ??
                      registrationOpenGame.entryFee
                    }
                    isSaving={updateEntryFee.isPending}
                    registeredCartelasCount={
                      registrationOpenGame.registeredCartelasCount
                    }
                    onStartEdit={startEntryFeeEdit}
                    onDraftChange={(value) =>
                      setEntryFeeDrafts((current) => ({
                        ...current,
                        [registrationOpenGame.slotId]: value,
                      }))
                    }
                    onSave={saveEntryFee}
                    onCancel={() => {
                      setSelectedGameForEdit(null);
                      setEntryFeeError(null);
                      setEntryFeeDrafts((current) => {
                        const next = { ...current };
                        delete next[registrationOpenGame.slotId];
                        return next;
                      });
                    }}
                  />
                }
                hint={
                  selectedGameForEdit === registrationOpenGame.slotId
                    ? "Minimum 8 ETB"
                    : canEditEntryFee(
                          registrationOpenGame.registeredCartelasCount,
                        )
                      ? "Click Edit to change"
                      : "Locked after first registration"
                }
              />
              <RegistrationStatCard
                label="Prize Pool"
                value={
                  <span className="text-2xl font-bold text-blue-700">
                    {formatCurrency(registrationOpenGame.prizeAmount)}
                  </span>
                }
              />
              <RegistrationStatCard
                label="Registered"
                value={
                  <span className="inline-flex items-center gap-2 text-2xl font-bold text-blue-700">
                    <Users className="h-5 w-5" />
                    {registrationOpenGame.registeredCartelasCount}
                  </span>
                }
                hint="cartelas"
              />
            </div>
            {entryFeeError && selectedGameForEdit === registrationOpenGame.slotId ? (
              <p className="mt-3 text-sm text-destructive">{entryFeeError}</p>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Empty state - no games */}
      {!currentGame && !registrationOpenGame && queue.length === 0 && (
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
            <CardTitle>Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {queue.map((game) => {
                const queuePosition =
                  reorderableSlots.findIndex((slot) => slot.slotId === game.slotId) + 1;

                return (
                <div
                  key={game.slotId}
                  className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium">
                      {queuePosition}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{game.gameRule?.name || "Game"}</p>
                        <Badge variant="outline" className="text-xs">
                          {game.rawStatus === "READY" ? "Ready" : "New"}
                        </Badge>
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
                        {game.staticCode} • Entry: {formatCurrency(game.entryFee)} •
                        Prize: {formatCurrency(game.prizeAmount)}
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
                        setCancelQueuedTarget({
                          slotId: game.slotId,
                          label: game.staticCode,
                        })
                      }
                      isLoading={isMutationPendingFor(cancelQueuedSlot, game.slotId)}
                      loadingLabel="..."
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <Ban className="h-4 w-4" />
                    </LoadingButton>
                  </div>
                </div>
              );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={isCreateGameModalOpen}
        onOpenChange={(open) => {
          setIsCreateGameModalOpen(open);
          if (!open) {
            setCreateGameError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Game to Queue</DialogTitle>
            <DialogDescription>
              Choose an active game rule. The new game is added to the end of the
              queue.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Game rule</Label>
              <Select value={selectedRuleId} onValueChange={setSelectedRuleId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a game rule" />
                </SelectTrigger>
                <SelectContent>
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

            <div className="space-y-2">
              <Label>Operation mode</Label>
              <Select
                value={createOperationMode}
                onValueChange={(value) =>
                  setCreateOperationMode(value as GameOperationMode)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANUAL">Manual</SelectItem>
                  <SelectItem value="AUTO">Automatic</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {createOperationMode === "AUTO" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="registration-duration">
                    Registration Duration (seconds)
                  </Label>
                  <Input
                    id="registration-duration"
                    type="number"
                    min={10}
                    max={600}
                    value={createRegistrationDurationSeconds}
                    onChange={(event) =>
                      setCreateRegistrationDurationSeconds(event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="auto-call-interval">
                    Auto-call Interval (seconds)
                  </Label>
                  <Input
                    id="auto-call-interval"
                    type="number"
                    min={3}
                    max={60}
                    value={createAutoCallIntervalSeconds}
                    onChange={(event) =>
                      setCreateAutoCallIntervalSeconds(event.target.value)
                    }
                  />
                </div>
              </div>
            ) : null}

            {createGameError ? (
              <p className="text-sm text-destructive">{createGameError}</p>
            ) : null}
          </div>

          <DialogFooter>
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

                const registrationDurationSeconds = Number(
                  createRegistrationDurationSeconds,
                );
                const autoCallIntervalSeconds = Number(
                  createAutoCallIntervalSeconds,
                );

                if (
                  createOperationMode === "AUTO" &&
                  (!Number.isFinite(registrationDurationSeconds) ||
                    registrationDurationSeconds < 10 ||
                    registrationDurationSeconds > 600)
                ) {
                  setCreateGameError(
                    "Registration duration must be between 10 and 600 seconds.",
                  );
                  return;
                }

                if (
                  createOperationMode === "AUTO" &&
                  (!Number.isFinite(autoCallIntervalSeconds) ||
                    autoCallIntervalSeconds < 3 ||
                    autoCallIntervalSeconds > 60)
                ) {
                  setCreateGameError(
                    "Auto-call interval must be between 3 and 60 seconds.",
                  );
                  return;
                }

                createGame.mutate({
                  gameRuleId: selectedRuleId,
                  operationMode: createOperationMode,
                  ...(createOperationMode === "AUTO"
                    ? {
                        registrationDurationSeconds,
                        autoCallIntervalSeconds,
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
                        setCallNumberForm(toCallNumberPayload(Number(e.target.value)))
                      }
                      disabled={isAutoCalling}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      const remaining = getRemainingCallNumbersFromList(liveCalledNumbers);
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
                      onClick={() => liveSessionId && stopAutoCall.mutate(liveSessionId)}
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
                      onClick={() => liveSessionId && startAutoCall.mutate(liveSessionId)}
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
              calledNumbers={liveCalledNumbers}
              compact
              title="Session called numbers"
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
                if (liveSessionId && isValidCalledNumber(callNumberForm.number)) {
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
          cancelLiveSession.mutate(currentGame.sessionId);
        }}
        isPending={cancelLiveSession.isPending}
      />

      <ConfirmActionDialog
        open={Boolean(cancelQueuedTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setCancelQueuedTarget(null);
          }
        }}
        title="Cancel queued game"
        description={
          cancelQueuedTarget
            ? `Cancel ${cancelQueuedTarget.label} and remove it from the queue.`
            : "Cancel this queued game."
        }
        confirmLabel="Cancel game"
        confirmVariant="destructive"
        onConfirm={() => {
          if (cancelQueuedTarget) {
            cancelQueuedSlot.mutate(cancelQueuedTarget.slotId);
          }
        }}
        isPending={cancelQueuedSlot.isPending}
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
      <PageHeader
        title="Game Operations"
        description="Manage live games, registrations, and queue"
      />
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
      <span className={cn("leading-none opacity-90", isLarge ? "text-xs" : "text-[9px]")}>
        {letter}
      </span>
      <span className={cn("leading-none", isLarge ? "text-xl" : "text-xs")}>{number}</span>
    </div>
  );
}

function CalledNumbersStrip({
  calledNumbers,
  compact = false,
  title = "Called this session",
}: {
  calledNumbers: CalledNumber[];
  compact?: boolean;
  title?: string;
}) {
  if (calledNumbers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-white/70 px-4 py-3 text-sm text-muted-foreground">
        {title}: no numbers called yet.
      </div>
    );
  }

  const latestId = calledNumbers.at(-1)?.id;

  return (
    <div className="rounded-lg border bg-white/80 px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <span className="text-xs text-muted-foreground">{calledNumbers.length} balls</span>
      </div>
      <div className={cn("flex flex-wrap gap-2", compact && "max-h-28 overflow-y-auto pr-1")}>
        {calledNumbers.map((calledNumber) => (
          <BingoBall
            key={calledNumber.id}
            letter={calledNumber.letter}
            number={calledNumber.number}
            isLatest={calledNumber.id === latestId}
          />
        ))}
      </div>
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
  const currentIndex = reorderableSlots.findIndex((slot) => slot.slotId === slotId);
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
}) {
  if (!isEditing) {
    return (
      <div className="flex flex-col items-center gap-2">
        <span className="text-2xl font-bold text-blue-700">
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
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-blue-100 bg-white/90 p-4 text-center shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-2">{value}</div>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
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

function getRemainingCallNumbersFromList(calledNumbers: CalledNumber[]): number[] {
  const used = new Set(calledNumbers.map((calledNumber) => calledNumber.number));
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
      <Badge variant="outline" className="border-violet-300 bg-violet-50 text-violet-800">
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

/**
 * Single registration-countdown line. The ticking seconds value is owned by
 * the parent so every countdown surface (hint, badge, this line) agrees.
 */
function RegistrationCountdown({
  secondsLeft,
  preparing = false,
  className,
}: {
  secondsLeft: number;
  preparing?: boolean;
  className?: string;
}) {
  if (preparing || secondsLeft <= 0) {
    return (
      <p className={cn("text-sm font-medium text-blue-700", className)}>
        Starting soon…
      </p>
    );
  }

  return (
    <p className={cn("text-sm font-medium text-blue-700", className)}>
      Registration closes in {secondsLeft}s
    </p>
  );
}

