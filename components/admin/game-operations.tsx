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
 * 1. LIVE GAME = response.liveGame (PLAYING status)
 * 2. CHECKING CLAIM = response.checkingGame (CHECKING status with pending claims)
 * 3. REGISTRATION OPEN = response.registrationOpenGame (READY or NEXT status)
 * 4. QUEUE = response.queue (remaining NEXT slots)
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  getAdminBingoClaims,
  getAdminGameRules,
  getCurrentGameOperations,
  getGameCalledNumbers,
  rejectAdminBingoClaim,
  reorderAdminSlots,
  startAdminGame,
  startSessionAutoCall,
  stopSessionAutoCall,
  updateAdminGameStatus,
  updateAdminSlotEntryFee,
} from "@/lib/api/admin";
import { ConfirmActionDialog } from "@/components/admin/confirm-action-dialog";
import { LoadingButton } from "@/components/admin/loading-button";
import { getApiErrorMessage } from "@/lib/api/errors";
import {
  isMutationPendingFor,
  useAdminMutation,
} from "@/lib/admin/use-admin-mutation";
import type {
  AdminBingoClaim,
  CallNumberPayload,
  CalledNumber,
} from "@/lib/api/types";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
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

// Query keys
const operationsQueryKey = ["games", "operations", "current"] as const;
const bingoClaimsQueryKey = ["admin", "bingo-claims", "pending"] as const;
const calledNumbersQueryKey = (sessionId: string) =>
  ["games", "called-numbers", sessionId] as const;

export function GameOperations() {
  const queryClient = useQueryClient();
  const [selectedGameForEdit, setSelectedGameForEdit] = useState<string | null>(null);
  const [entryFeeDrafts, setEntryFeeDrafts] = useState<Record<string, string>>({});
  const [entryFeeError, setEntryFeeError] = useState<string | null>(null);
  const [isCreateGameModalOpen, setIsCreateGameModalOpen] = useState(false);
  const [selectedRuleId, setSelectedRuleId] = useState("");
  const [createGameError, setCreateGameError] = useState<string | null>(null);

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

  // CANONICAL: Use backend's single source of truth endpoint
  // Backend decides which game is live/checking/registration/queue
  const {
    data: operations,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: operationsQueryKey,
    queryFn: getCurrentGameOperations,
    refetchOnWindowFocus: true,
    staleTime: 0,
    refetchInterval: false,
  });

  // Extract canonical sections from backend response
  const liveGame = operations?.liveGame;
  const checkingGame = operations?.checkingGame;
  const isWinnerWindow = liveGame?.playerStatus === "winnerWindow";
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
  }, [isWinnerWindow, liveGame?.winnerWindowEndsAt]);
  const registrationOpenGame = operations?.registrationOpenGame;
  const queue = operations?.queue ?? [];
  const liveSessionId = liveGame?.sessionId ?? null;
  const pollOperationsFallback = !!liveGame || !socketConnected;

  useEffect(() => {
    return socketService.onConnectionChange(setSocketConnected);
  }, []);

  useEffect(() => {
    if (!pollOperationsFallback) {
      return;
    }

    const timer = window.setInterval(() => {
      void refetch();
    }, 5000);

    return () => window.clearInterval(timer);
  }, [pollOperationsFallback, refetch]);

  const { data: liveCalledNumbersData } = useQuery({
    queryKey: liveSessionId
      ? calledNumbersQueryKey(liveSessionId)
      : ["games", "called-numbers", "none"],
    queryFn: () => getGameCalledNumbers(liveSessionId!),
    enabled: !!liveSessionId,
  });

  const liveCalledNumbers = liveCalledNumbersData?.calledNumbers ?? [];
  const isAutoCalling = liveGame?.autoCallEnabled ?? false;
  const autoCallIntervalSec = Math.round(
    (liveGame?.autoCallIntervalMs ?? 7000) / 1000,
  );

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
    refetchInterval: 5000,
    enabled: !!checkingGame && isManualChecking,
  });

  // Socket listeners - refetch canonical endpoint on any game operation
  useEffect(() => {
    const handleOperationUpdate = () => {
      queryClient.invalidateQueries({ queryKey: operationsQueryKey });
      queryClient.invalidateQueries({ queryKey: ["games", "called-numbers"] });
      queryClient.invalidateQueries({ queryKey: bingoClaimsQueryKey });
    };

    socketService.on("connect", handleOperationUpdate);
    socketService.on("game:operation_updated", handleOperationUpdate);
    socketService.on("game:number_called", handleOperationUpdate);
    socketService.on("game:bingo_claimed", handleOperationUpdate);
    socketService.on("game:winner_window_started", handleOperationUpdate);
    socketService.on("game:winner_window_joined", handleOperationUpdate);
    socketService.on("game:finished", handleOperationUpdate);
    socketService.on("session:prize_updated", handleOperationUpdate);
    socketService.on("slot:status_changed", handleOperationUpdate);

    return () => {
      socketService.off("connect", handleOperationUpdate);
      socketService.off("game:operation_updated", handleOperationUpdate);
      socketService.off("game:number_called", handleOperationUpdate);
      socketService.off("game:bingo_claimed", handleOperationUpdate);
      socketService.off("game:winner_window_started", handleOperationUpdate);
      socketService.off("game:winner_window_joined", handleOperationUpdate);
      socketService.off("game:finished", handleOperationUpdate);
      socketService.off("session:prize_updated", handleOperationUpdate);
      socketService.off("slot:status_changed", handleOperationUpdate);
    };
  }, [queryClient]);

  const openCreateGameModal = () => {
    setCreateGameError(null);
    setIsCreateGameModalOpen(true);
  };

  const createGame = useAdminMutation({
    mutationFn: (gameRuleId: string) => createAdminGame({ gameRuleId }),
    successMessage: "Game added to queue.",
    errorMessage: "Could not add the game to the queue.",
    invalidateQueryKeys: [operationsQueryKey],
    onSuccess: () => {
      setIsCreateGameModalOpen(false);
      setCreateGameError(null);
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
    invalidateQueryKeys: [operationsQueryKey],
  });

  const cancelLiveSession = useAdminMutation({
    mutationFn: (sessionId: string) => cancelBlockingSession(sessionId),
    successMessage: "Live game cancelled.",
    errorMessage: "Failed to cancel live game.",
    invalidateQueryKeys: [operationsQueryKey],
    onSuccess: () => {
      setCancelLiveOpen(false);
    },
  });

  const cancelQueuedSlot = useAdminMutation({
    mutationFn: (slotId: string) =>
      updateAdminGameStatus(slotId, { status: "CANCELLED" }),
    successMessage: "Queued game cancelled.",
    errorMessage: "Failed to cancel queued game.",
    invalidateQueryKeys: [operationsQueryKey],
    onSuccess: () => {
      setCancelQueuedTarget(null);
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
    invalidateQueryKeys: [operationsQueryKey, ["games", "called-numbers"]],
    onSuccess: () => {
      setCallNumberError(null);
    },
    onError: (error) => {
      setCallNumberError(getApiErrorMessage(error, "Failed to call number"));
    },
  });

  const startAutoCall = useAdminMutation({
    mutationFn: (sessionId: string) => startSessionAutoCall(sessionId),
    successMessage: "Auto-call started.",
    errorMessage: "Failed to start auto-call.",
    invalidateQueryKeys: [operationsQueryKey],
    onSuccess: () => {
      setCallNumberError(null);
    },
    onError: (error) => {
      setCallNumberError(getApiErrorMessage(error, "Failed to start auto-call"));
    },
  });

  const stopAutoCall = useAdminMutation({
    mutationFn: (sessionId: string) => stopSessionAutoCall(sessionId),
    successMessage: "Auto-call stopped.",
    errorMessage: "Failed to stop auto-call.",
    invalidateQueryKeys: [operationsQueryKey],
    onSuccess: () => {
      setCallNumberError(null);
    },
    onError: (error) => {
      setCallNumberError(getApiErrorMessage(error, "Failed to stop auto-call"));
    },
  });

  const approveClaim = useAdminMutation({
    mutationFn: approveAdminBingoClaim,
    successMessage: "Bingo claim approved.",
    errorMessage: "Failed to approve bingo claim.",
    invalidateQueryKeys: [bingoClaimsQueryKey, operationsQueryKey],
    onSuccess: () => {
      setApproveClaimTarget(null);
    },
  });

  const rejectClaim = useAdminMutation({
    mutationFn: ({ claimId, reason }: { claimId: string; reason: string }) =>
      rejectAdminBingoClaim(claimId, reason),
    successMessage: "Bingo claim rejected.",
    errorMessage: "Failed to reject bingo claim.",
    invalidateQueryKeys: [bingoClaimsQueryKey, operationsQueryKey],
    onSuccess: () => {
      setRejectClaimTarget(null);
    },
  });

  const updateEntryFee = useAdminMutation({
    mutationFn: ({ gameId, entryFee }: { gameId: string; entryFee: string }) =>
      updateAdminSlotEntryFee(gameId, entryFee),
    successMessage: "Entry fee updated.",
    errorMessage: "Could not update the entry fee.",
    invalidateQueryKeys: [operationsQueryKey],
    onSuccess: (_, { gameId }) => {
      setSelectedGameForEdit(null);
      setEntryFeeError(null);
      setEntryFeeDrafts((current) => {
        const next = { ...current };
        delete next[gameId];
        return next;
      });
    },
    onError: (error) => {
      setEntryFeeError(
        getApiErrorMessage(error, "Could not update the entry fee."),
      );
    },
  });

  const reorderSlots = useAdminMutation({
    mutationFn: reorderAdminSlots,
    successMessage: "Queue order updated.",
    errorMessage: "Failed to reorder queue.",
    invalidateQueryKeys: [operationsQueryKey],
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

  if (isLoading) {
    return <GameOperationsSkeleton />;
  }

  if (error) {
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Game Operations"
        description="Manage live games, registrations, and queue"
        className="hidden sm:block"
      />

      {!socketConnected ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Realtime disconnected. Reconnecting and polling game state every 5 seconds.
        </div>
      ) : null}

      {/* 1. LIVE GAME - PLAYING status */}
      {liveGame && (
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Radio className="h-5 w-5 animate-pulse text-green-600" />
                <CardTitle className="text-green-900">Live Game</CardTitle>
                <Badge className="bg-green-100 text-green-800">PLAYING</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <LoadingButton
                  variant="outline"
                  size="sm"
                  onClick={() => setCancelLiveOpen(true)}
                  isLoading={cancelLiveSession.isPending}
                  loadingLabel="Cancelling..."
                  disabled={!liveGame.sessionId}
                  className="border-red-200 text-red-600 hover:bg-red-50"
                >
                  <Ban className="mr-2 h-4 w-4" />
                  Cancel
                </LoadingButton>
              </div>
            </div>
            <CardDescription>
              {liveGame.gameRule?.name || "Game"} • Code: {liveGame.staticCode}
              {liveGame.playCode && ` / ${liveGame.playCode}`}
              {" • "}Live position is locked and cannot be reordered.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="bg-white">
                <CardContent className="flex flex-col items-center p-4">
                  <p className="text-sm text-muted-foreground">Latest Called</p>
                  {liveCalledNumbers.length > 0 ? (
                    <div className="mt-3">
                      <BingoBall
                        letter={liveCalledNumbers.at(-1)!.letter}
                        number={liveCalledNumbers.at(-1)!.number}
                        size="lg"
                        isLatest
                      />
                    </div>
                  ) : liveGame.latestCalledNumber ? (
                    <div className="mt-3">
                      <BingoBall
                        letter={liveGame.latestCalledNumber.letter}
                        number={liveGame.latestCalledNumber.number}
                        size="lg"
                        isLatest
                      />
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      No numbers called yet
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">Prize Pool</p>
                  <p className="mt-2 text-3xl font-bold text-primary">
                    {formatCurrency(liveGame.prizeAmount)}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">Players</p>
                  <p className="mt-2 text-3xl font-bold text-primary">
                    {liveGame.registeredCartelasCount}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {liveGame.calledNumbersCount} of 75 called
                  </p>
                </CardContent>
              </Card>
            </div>

            <CalledNumbersStrip calledNumbers={liveCalledNumbers} />

            {isWinnerWindow && liveGame.winnerWindowEndsAt && (
              <div className="rounded-lg border border-violet-300 bg-violet-50 px-4 py-3 text-violet-900">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">Winner window open</p>
                    <p className="text-sm text-violet-800">
                      Automatic rule validation is active. Other valid claims can
                      still join until the timer ends.
                    </p>
                    {(liveGame.winnerPayoutsSummary?.length ??
                      liveGame.winnerCartelasSummary?.length ??
                      0) > 0 ? (
                      <p className="mt-2 text-sm text-violet-900">
                        Winners so far:{" "}
                        {(liveGame.winnerPayoutsSummary ??
                          liveGame.winnerCartelasSummary ??
                          [])
                          .map((winner) =>
                            "amount" in winner && winner.amount
                              ? `#${winner.cartelaNumber} — ${winner.amount} ETB`
                              : `#${winner.cartelaNumber}`,
                          )
                          .join(", ")}
                      </p>
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
                        (new Date(liveGame.winnerWindowEndsAt).getTime() -
                          winnerWindowNow) /
                          1000,
                      ),
                    )}
                    s left
                  </Badge>
                </div>
              </div>
            )}

            {isAutoCalling && (
              <div className="flex flex-col gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Radio className="h-4 w-4 animate-pulse" />
                  Auto Call is running every {autoCallIntervalSec} seconds
                </div>
                <Badge variant="outline" className="border-red-300 bg-white text-red-700">
                  LIVE
                </Badge>
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={() => setIsCallNumberModalOpen(true)}
                disabled={!liveSessionId}
                className="flex-1"
                size="lg"
                variant={isAutoCalling ? "outline" : "default"}
              >
                <Phone className="mr-2 h-5 w-5" />
                {isAutoCalling ? "Open Call Panel" : "Call Number"}
              </Button>
              {isAutoCalling && liveSessionId && (
                <LoadingButton
                  onClick={() => stopAutoCall.mutate(liveSessionId)}
                  size="lg"
                  variant="destructive"
                  className="flex-1 sm:max-w-[220px]"
                  isLoading={stopAutoCall.isPending}
                  loadingLabel="Stopping..."
                >
                  <PauseCircle className="mr-2 h-5 w-5" />
                  Stop Auto Call
                </LoadingButton>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 2. CHECKING CLAIM - CHECKING status */}
      {checkingGame && isManualChecking && bingoClaims && bingoClaims.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-amber-600" />
                <CardTitle className="text-amber-900">Checking Bingo Claim</CardTitle>
                <Badge className="bg-amber-100 text-amber-800">CHECKING</Badge>
              </div>
            </div>
            <CardDescription>
              {checkingGame.gameRule?.name || "Game"} • Review and approve or reject
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {bingoClaims.map((claim) => (
                <Card key={claim.id} className="bg-white">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium">
                          Cartela #{claim.gameCartela?.cartela?.number}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Claimed: {new Date(claim.createdAt).toLocaleTimeString()}
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
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. REGISTRATION OPEN - next round after live game */}
      {registrationOpenGame && (
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50/80 to-slate-50">
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Clock3 className="h-5 w-5 text-blue-600" />
                  <CardTitle className="text-blue-950">Up Next — Registration Open</CardTitle>
                  <Badge className="bg-blue-100 text-blue-800">
                    {registrationOpenGame.rawStatus === "NEXT" ? "NEW" : "READY"}
                  </Badge>
                </div>
                <CardDescription className="text-blue-900/70">
                  {liveGame
                    ? "Players register now. This round replaces the live game after it finishes."
                    : "Players can register cartelas. Start when you are ready."}
                </CardDescription>
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
                <LoadingButton
                  size="sm"
                  onClick={() => startGame.mutate(registrationOpenGame.slotId)}
                  isLoading={isMutationPendingFor(
                    startGame,
                    registrationOpenGame.slotId,
                  )}
                  loadingLabel="Starting..."
                  disabled={!!liveGame}
                  className="bg-blue-600 hover:bg-blue-700"
                  title={liveGame ? "Finish or cancel the live game first" : undefined}
                >
                  <Play className="mr-2 h-4 w-4" />
                  Start Game
                </LoadingButton>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {registrationOpenGame.gameRule?.name || "Game"} • {registrationOpenGame.staticCode}
              {registrationOpenGame.playCode && ` / ${registrationOpenGame.playCode}`}
            </p>
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
      {!liveGame && !checkingGame && !registrationOpenGame && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="mb-4 rounded-full bg-muted p-3">
              <Plus className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-lg font-medium">No games in queue</p>
            <p className="mb-4 text-sm text-muted-foreground">
              Create a new game to get started
            </p>
            <Button onClick={openCreateGameModal}>
              <Plus className="mr-2 h-4 w-4" />
              Add Game to Queue
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 4. QUEUE - remaining NEXT slots */}
      {queue.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Queue</CardTitle>
            <CardDescription>
              Reorder upcoming games. Live and checking games stay fixed.
            </CardDescription>
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

      {/* Add Game Button (when games exist) */}
      {(liveGame || checkingGame || registrationOpenGame || queue.length > 0) && (
        <div className="flex justify-end">
          <Button onClick={openCreateGameModal}>
            <Plus className="mr-2 h-4 w-4" />
            Add Game to Queue
          </Button>
        </div>
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
              <Label>Game Rule</Label>
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
                createGame.mutate(selectedRuleId);
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
              {liveGame
                ? `Calling numbers for ${liveGame.staticCode}. Auto Call runs on the server and survives refresh.`
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
                  {liveGame?.calledNumbersCount?.toLocaleString() ?? 0} of 75 called
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
        open={cancelLiveOpen}
        onOpenChange={setCancelLiveOpen}
        title="Cancel live game"
        description={
          liveGame
            ? `Cancel ${liveGame.staticCode} while it is PLAYING. Players will see the session end and the slot moves to the back of the queue.`
            : "Cancel the live game."
        }
        confirmLabel="Cancel live game"
        confirmVariant="destructive"
        onConfirm={() => {
          if (liveGame?.sessionId) {
            cancelLiveSession.mutate(liveGame.sessionId);
          }
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
