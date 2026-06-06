"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Save,
  Target,
} from "lucide-react";

import {
  callAdminGameNumber,
  cancelBlockingSession,
  createAdminGame,
  extractLiveSessionId,
  getAdminGameRules,
  getAdminGames,
  getGameCalledNumbers,
  getGameDetail,
  getCurrentLiveSession,
  reorderAdminSlots,
  startAdminGame,
  updateAdminGameStatus,
  updateAdminSlotEntryFee,
} from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { AdminGame, CallNumberPayload, GameStatus } from "@/lib/api/types";
import { formatCurrency } from "@/lib/formatters";
import { socketService } from "@/lib/socket/socket-service";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { AdminTableSkeleton } from "@/components/admin/admin-table-skeleton";
import {
  AdminEmptyState,
  AdminErrorState,
} from "@/components/admin/admin-table-state";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const pageSize = 20;
const PRIZE_PER_CARTELA = "8";
const gamesQueryKey = (page: number) => ["admin", "games", page] as const;
const gameDetailQueryKey = (gameId: string) =>
  ["admin", "games", "detail", gameId] as const;
const calledNumbersQueryKey = (gameId: string) =>
  ["admin", "games", "called-numbers", gameId] as const;

const statusTransitionOptions: Record<GameStatus, GameStatus[]> = {
  NEXT: ["CANCELLED"],
  CHECKING: ["PLAYING", "FINISHED", "CANCELLED"],
  PLAYING: ["CHECKING", "CANCELLED"],
  FINISHED: [],
  CANCELLED: [],
};

type CreateGameFormState = {
  gameRuleId: string;
};

const initialCreateGameForm: CreateGameFormState = {
  gameRuleId: "",
};

export function GamesManagement() {
  const queryClient = useQueryClient();
  const autoCallTimerRef = useRef<number | null>(null);
  const [page, setPage] = useState(1);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateGameFormState>(
    initialCreateGameForm,
  );
  const [createError, setCreateError] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState<AdminGame | null>(null);
  const [statusValue, setStatusValue] = useState<GameStatus | "">("");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [startTarget, setStartTarget] = useState<AdminGame | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [blockingSessionId, setBlockingSessionId] = useState<string | null>(
    null,
  );
  const [callNumberTarget, setCallNumberTarget] = useState<AdminGame | null>(
    null,
  );
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [callNumberForm, setCallNumberForm] = useState<CallNumberPayload>({
    letter: "B",
    number: 1,
  });
  const [callNumberError, setCallNumberError] = useState<string | null>(null);
  const [isAutoCalling, setIsAutoCalling] = useState(false);
  const [autoCallingGameId, setAutoCallingGameId] = useState<string | null>(null);
  const [entryFeeDrafts, setEntryFeeDrafts] = useState<Record<string, string>>(
    {},
  );

  const gamesQuery = useQuery({
    queryKey: gamesQueryKey(page),
    queryFn: () => getAdminGames(page, pageSize),
    refetchInterval: 5000,
  });

  const gameRulesQuery = useQuery({
    queryKey: ["admin", "game-rules"],
    queryFn: getAdminGameRules,
  });

  const gameDetailQuery = useQuery({
    queryKey: selectedGameId
      ? gameDetailQueryKey(selectedGameId)
      : ["admin", "games", "detail"],
    queryFn: () => getGameDetail(selectedGameId as string),
    enabled: Boolean(selectedGameId),
    refetchInterval: selectedGameId ? 5000 : false,
  });

  const calledNumbersQuery = useQuery({
    queryKey: activeSessionId
      ? calledNumbersQueryKey(activeSessionId)
      : ["admin", "games", "called-numbers"],
    queryFn: () => getGameCalledNumbers(activeSessionId as string),
    enabled: Boolean(activeSessionId),
    refetchInterval: activeSessionId ? 5000 : false,
  });

  const modalCalledNumbersQuery = useQuery({
    queryKey: activeSessionId
      ? calledNumbersQueryKey(activeSessionId)
      : ["admin", "games", "called-numbers", "modal"],
    queryFn: () => getGameCalledNumbers(activeSessionId as string),
    enabled: Boolean(callNumberTarget) && Boolean(activeSessionId),
    refetchInterval: callNumberTarget ? 3000 : false,
  });

  useEffect(() => {
    const handleGameOperationUpdate = (data: unknown) => {
      // Optimistic update: merge the normalized slot data into the current cache
      const slot = data as AdminGame | null;
      if (slot?.id) {
        queryClient.setQueryData<{ items: AdminGame[]; pagination: unknown }>(
          gamesQueryKey(page),
          (old) => {
            if (!old) return old;
            const items = old.items.map((item) =>
              item.id === slot.id ? { ...item, ...slot } : item,
            );
            return { ...old, items };
          },
        );
      }
      // Also invalidate to ensure consistency with server state
      queryClient.invalidateQueries({ queryKey: ["admin", "games"] });
    };

    const handleSlotCreated = () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "games"] });
    };

    const handleGameStatusChanged = () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "games"] });
    };

    const handleGameFinished = () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "games"] });
    };

    const handleSessionPrizeUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "games"] });
    };

    socketService.on("game:operation_updated", handleGameOperationUpdate);
    socketService.on("slot:created", handleSlotCreated);
    socketService.on("game:status_changed", handleGameStatusChanged);
    socketService.on("game:finished", handleGameFinished);
    socketService.on("session:prize_updated", handleSessionPrizeUpdated);

    return () => {
      socketService.off("game:operation_updated", handleGameOperationUpdate);
      socketService.off("slot:created", handleSlotCreated);
      socketService.off("game:status_changed", handleGameStatusChanged);
      socketService.off("game:finished", handleGameFinished);
      socketService.off("session:prize_updated", handleSessionPrizeUpdated);
    };
  }, [queryClient, page]);

  const createGameMutation = useMutation({
    mutationFn: () =>
      createAdminGame({
        gameRuleId: createForm.gameRuleId,
      }),
    onSuccess: async () => {
      setCreateOpen(false);
      setCreateForm(initialCreateGameForm);
      setCreateError(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "games"] });
    },
    onError: (error) => {
      setCreateError(
        getApiErrorMessage(error, "The game could not be created."),
      );
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ gameId, status }: { gameId: string; status: GameStatus }) =>
      updateAdminGameStatus(gameId, { status }),
    onSuccess: async (_, variables) => {
      setStatusTarget(null);
      setStatusValue("");
      setStatusError(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "games"] });
    },
    onError: (error) => {
      setStatusError(
        getApiErrorMessage(error, "The game status could not be updated."),
      );
    },
  });

  const queueMoveMutation = useMutation({
    mutationFn: ({
      gameId,
      direction,
    }: {
      gameId: string;
      direction: "up" | "down";
    }) => {
      const current = queryClient.getQueryData<{ items: AdminGame[] }>(
        gamesQueryKey(page),
      );
      const items = current?.items ? [...current.items] : [];
      const index = items.findIndex((g) => g.id === gameId);
      if (index === -1) return Promise.resolve();
      if (direction === "up" && index > 0) {
        [items[index - 1], items[index]] = [items[index], items[index - 1]];
      } else if (direction === "down" && index < items.length - 1) {
        [items[index], items[index + 1]] = [items[index + 1], items[index]];
      }
      const slotIds = items.map((g) => g.id);
      return reorderAdminSlots(slotIds).then(() => {});
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "games"] });
    },
  });

  const updateEntryFeeMutation = useMutation({
    mutationFn: ({
      gameId,
      entryFee,
    }: {
      gameId: string;
      entryFee: string;
    }) => updateAdminSlotEntryFee(gameId, entryFee),
    onSuccess: async (_, { gameId }) => {
      setEntryFeeDrafts((current) => {
        const next = { ...current };
        delete next[gameId];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["admin", "games"] });
    },
  });

  const startMutation = useMutation({
    mutationFn: (gameId: string) => startAdminGame(gameId),
    onSuccess: async (_, gameId) => {
      setStartTarget(null);
      setStartError(null);
      setBlockingSessionId(null);
      await invalidateGameQueries(queryClient, gameId);
    },
    onError: async (error) => {
      const msg = getApiErrorMessage(error, "The game could not be started.");
      setStartError(msg);
      if (msg.toLowerCase().includes("already active")) {
        try {
          const live = await getCurrentLiveSession();
          const sid = extractLiveSessionId(live);
          if (sid) setBlockingSessionId(sid);
        } catch {}
      }
    },
  });

  const cancelBlockingMutation = useMutation({
    mutationFn: (sessionId: string) => cancelBlockingSession(sessionId),
    onSuccess: async () => {
      setBlockingSessionId(null);
      setStartError(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "games"] });
    },
    onError: (error) => {
      setStartError(
        getApiErrorMessage(error, "Could not cancel the blocking session."),
      );
    },
  });

  const callNumberMutation = useMutation({
    mutationFn: ({
      sessionId,
      payload,
    }: {
      sessionId: string;
      payload: CallNumberPayload;
    }) => callAdminGameNumber(sessionId, payload),
    onSuccess: async () => {
      if (isAutoCalling && remainingCallNumbers.length <= 1) {
        setIsAutoCalling(false);
      }
      setCallNumberError(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "games"] });
    },
    onError: (error) => {
      setIsAutoCalling(false);
      setCallNumberError(
        getApiErrorMessage(error, "The called number could not be recorded."),
      );
    },
  });

  const operationalGames = useMemo(() => {
    const items = gamesQuery.data?.items ?? [];
    const statusOrder: Record<GameStatus, number> = {
      PLAYING: 0,
      CHECKING: 1,
      NEXT: 2,
      FINISHED: 3,
      CANCELLED: 4,
    };

    return [...items].sort((left, right) => {
      const statusDiff = statusOrder[left.status] - statusOrder[right.status];
      if (statusDiff !== 0) {
        return statusDiff;
      }

      return (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
    });
  }, [gamesQuery.data?.items]);

  const summary = useMemo(() => {
    const items = operationalGames;
    const queuedGames = items
      .filter((game) => game.status === "NEXT")
      .sort(
        (left, right) =>
          (left.sortOrder ?? Number.MAX_SAFE_INTEGER) -
          (right.sortOrder ?? Number.MAX_SAFE_INTEGER),
      );

    return {
      live: items.filter((game) => game.status === "PLAYING").length,
      checking: items.filter((game) => game.status === "CHECKING").length,
      queued: queuedGames.length,
      nextUp: queuedGames[0] ?? null,
    };
  }, [operationalGames]);

  const calledNumbers = calledNumbersQuery.data?.calledNumbers ?? [];
  const latestCalledNumber = calledNumbers.at(-1) ?? null;
  const modalCalledNumbers = modalCalledNumbersQuery.data?.calledNumbers ?? [];
  const latestModalCalledNumber = modalCalledNumbers.at(-1) ?? null;
  const gameRules = useMemo(
    () => gameRulesQuery.data ?? [],
    [gameRulesQuery.data],
  );
  const defaultGameRuleId = useMemo(
    () =>
      (gameRules.find((rule) => rule.key === "MANUAL") ?? gameRules[0])?.id ??
      "",
    [gameRules],
  );
  const remainingCallNumbers = getRemainingCallNumbers(calledNumbers);
  const autoCallActive = isAutoCalling && remainingCallNumbers.length > 0;
  const closeCallNumberDialog = () => {
    // Do NOT stop auto-call when closing modal — auto-call continues in background
    setCallNumberTarget(null);
    setCallNumberForm({ letter: "B", number: 1 });
    setCallNumberError(null);
  };

  const stopAutoCall = () => {
    setIsAutoCalling(false);
    setAutoCallingGameId(null);
  };

  useEffect(() => {
    if (!selectedGameId) {
      setActiveSessionId(null);
      return;
    }

    const sessionId = gameDetailQuery.data?.sessionId ?? null;
    setActiveSessionId(sessionId);
  }, [gameDetailQuery.data?.sessionId, selectedGameId]);

  // Auto-call timer: runs independently of callNumberTarget
  // Auto-call continues in background even after modal is closed
  useEffect(() => {
    if (!autoCallActive || !activeSessionId) {
      if (autoCallTimerRef.current) {
        window.clearTimeout(autoCallTimerRef.current);
        autoCallTimerRef.current = null;
      }
      return;
    }

    autoCallTimerRef.current = window.setTimeout(() => {
      const nextCall = getRandomCallNumber(remainingCallNumbers);

      if (!nextCall || callNumberMutation.isPending) {
        return;
      }

      // Only update the form if the modal is open
      if (callNumberTarget) {
        setCallNumberForm(nextCall);
      }

      callNumberMutation.mutate({
        sessionId: activeSessionId,
        payload: nextCall,
      });
    }, 7000);

    return () => {
      if (autoCallTimerRef.current) {
        window.clearTimeout(autoCallTimerRef.current);
        autoCallTimerRef.current = null;
      }
    };
  }, [
    autoCallActive,
    activeSessionId,
    callNumberMutation,
    remainingCallNumbers,
    callNumberTarget,
  ]);

  // Track the game being auto-called so the table shows a stop button
  useEffect(() => {
    if (isAutoCalling && callNumberTarget) {
      setAutoCallingGameId(callNumberTarget.id);
    } else if (!isAutoCalling) {
      setAutoCallingGameId(null);
    }
  }, [isAutoCalling, callNumberTarget]);

  // Refresh called numbers periodically even when modal is closed
  // Uses a background query that runs when auto-call is active but modal is closed
  const backgroundCalledNumbersQuery = useQuery({
    queryKey: activeSessionId
      ? ["admin", "games", "called-numbers", "background", activeSessionId]
      : ["admin", "games", "called-numbers", "background"],
    queryFn: () => getGameCalledNumbers(activeSessionId as string),
    enabled: isAutoCalling && Boolean(activeSessionId) && !callNumberTarget,
    refetchInterval: isAutoCalling ? 4000 : false,
  });

  // Use background query results when modal is closed but auto-call is active
  const backgroundCalledNumbersResult =
    backgroundCalledNumbersQuery.data?.calledNumbers ?? [];
  const effectiveCalledNumbers = callNumberTarget
    ? modalCalledNumbers
    : isAutoCalling
    ? backgroundCalledNumbersResult
    : calledNumbers;
  const latestEffectiveCalledNumber = effectiveCalledNumbers.at(-1) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Games"
        description="Run today's bingo rounds: queue games, start the next slot, call numbers, and finish or cancel active sessions."
      />

      <Card>
        <CardHeader className="gap-3 border-b border-border/60">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle>Game operations</CardTitle>
              <CardDescription>
                Only active rounds appear here. Finished and cancelled games
                leave this view automatically.
              </CardDescription>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
                <div className="font-medium text-foreground">
                  {summary.live.toLocaleString()} live now
                </div>
                <div className="text-muted-foreground">
                  {summary.checking.toLocaleString()} under review
                </div>
                <div className="text-muted-foreground">
                  {summary.queued.toLocaleString()} in queue
                  {summary.nextUp
                    ? ` · next: ${summary.nextUp.staticCode}`
                    : ""}
                </div>
              </div>
              <Button
                onClick={() => {
                  setCreateError(null);
                  setCreateForm({
                    ...initialCreateGameForm,
                    gameRuleId: defaultGameRuleId,
                  });
                  setCreateOpen(true);
                }}
              >
                <Plus className="size-4" />
                Create game
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-0 pt-0">
          {gamesQuery.isLoading ? (
            <AdminTableSkeleton columns={6} />
          ) : gamesQuery.isError ? (
            <AdminErrorState
              title="Could not load games"
              description={getApiErrorMessage(
                gamesQuery.error,
                "Please try refreshing the games table.",
              )}
              onRetry={() => gamesQuery.refetch()}
            />
          ) : operationalGames.length === 0 ? (
            <AdminEmptyState
              title="No active games"
              description="Create a game to add it to today's queue."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Slot</TableHead>
                    <TableHead>Rule</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Entry fee</TableHead>
                    <TableHead>Prize</TableHead>
                    <TableHead>Players</TableHead>
                    <TableHead>Called</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operationalGames.map((game) => {
                    const nextStatuses = statusTransitionOptions[game.status];
                    const canStart =
                      game.status === "NEXT" && game.sortOrder === 1;
                    const canReorder = game.status === "NEXT";
                    const canCallNumber = game.status === "PLAYING";
                    const canEditEntryFee = game.status === "NEXT";
                    const entryFeeValue = canEditEntryFee
                      ? (entryFeeDrafts[game.id] ?? game.entryFee)
                      : game.entryFee;

                    return (
                      <TableRow key={game.id}>
                        <TableCell>
                          <div className="min-w-[100px]">
                            <div className="font-mono text-sm font-medium">
                              {game.staticCode}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Order {game.sortOrder ?? "-"}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="min-w-[140px] font-medium">
                            {game.gameRule?.name ?? game.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <AdminStatusBadge status={game.status} />
                        </TableCell>
                        <TableCell>
                          {canEditEntryFee ? (
                            <Input
                              className="h-8 w-24"
                              value={entryFeeValue}
                              disabled={updateEntryFeeMutation.isPending}
                              onChange={(event) =>
                                setEntryFeeDrafts((current) => ({
                                  ...current,
                                  [game.id]: event.target.value,
                                }))
                              }
                              onBlur={() => {
                                const nextValue = entryFeeDrafts[game.id];
                                if (
                                  !nextValue ||
                                  nextValue === game.entryFee ||
                                  !isValidEntryFee(nextValue)
                                ) {
                                  if (nextValue && !isValidEntryFee(nextValue)) {
                                    setEntryFeeDrafts((current) => {
                                      const draft = { ...current };
                                      delete draft[game.id];
                                      return draft;
                                    });
                                  }
                                  return;
                                }

                                updateEntryFeeMutation.mutate({
                                  gameId: game.id,
                                  entryFee: nextValue,
                                });
                              }}
                            />
                          ) : (
                            <span className="text-sm">
                              {formatCurrency(game.entryFee)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {formatCurrency(game.prizeAmount)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {game.registeredCartelasCount}
                          </span>
                        </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {game.calledNumbersCount}
                        </span>
                        {autoCallingGameId === game.id ? (
                          <Badge
                            variant="default"
                            className="ml-1 animate-pulse bg-destructive text-destructive-foreground text-xs"
                          >
                            Auto
                          </Badge>
                        ) : null}
                      </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {canReorder ? (
                              <div className="flex gap-1">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="size-7"
                                  disabled={queueMoveMutation.isPending}
                                  onClick={() =>
                                    queueMoveMutation.mutate({
                                      gameId: game.id,
                                      direction: "up",
                                    })
                                  }
                                >
                                  <ArrowUp className="size-3.5" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="size-7"
                                  disabled={queueMoveMutation.isPending}
                                  onClick={() =>
                                    queueMoveMutation.mutate({
                                      gameId: game.id,
                                      direction: "down",
                                    })
                                  }
                                >
                                  <ArrowDown className="size-3.5" />
                                </Button>
                              </div>
                            ) : null}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedGameId(game.id)}
                            >
                              <Eye className="size-4" />
                              View
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={nextStatuses.length === 0}
                              onClick={() => {
                                setStatusError(null);
                                setStatusTarget(game);
                                setStatusValue(nextStatuses[0] ?? "");
                              }}
                            >
                              <RefreshCw className="size-4" />
                              Status
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={!canStart}
                              onClick={() => {
                                setStartError(null);
                                setStartTarget(game);
                              }}
                            >
                              <Play className="size-4" />
                              Start
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={!canCallNumber}
                              onClick={async () => {
                                setCallNumberError(null);
                                setIsAutoCalling(false);
                                setCallNumberTarget(game); // open modal regardless
                                setCallNumberForm({ letter: "B", number: 1 });
                                if (game.sessionId) {
                                  setActiveSessionId(game.sessionId);
                                  return;
                                }
                                try {
                                  const live = await getCurrentLiveSession();
                                  const sid = extractLiveSessionId(live);
                                  if (!sid) {
                                    setCallNumberError(
                                      "No active session found. Start a game first.",
                                    );
                                    return;
                                  }
                                  setActiveSessionId(sid);
                                } catch (e) {
                                  setCallNumberError(
                                    "Could not resolve active session for calling numbers.",
                                  );
                                }
                              }}
                            >
                              <Radio className="size-4" />
                              Call number
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <AdminPagination
                pagination={gamesQuery.data!.pagination}
                onPageChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setCreateError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Create game</DialogTitle>
            <DialogDescription>
              Create a NEXT game round from a rule. It will be added to the end
              of the queue automatically with the next order number.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Game rule</Label>
              <Select
                value={createForm.gameRuleId || undefined}
                onValueChange={(value) =>
                  setCreateForm((current) => ({
                    ...current,
                    gameRuleId: value,
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select game rule" />
                </SelectTrigger>
                <SelectContent>
                  {gameRules.map((gameRule) => (
                    <SelectItem key={gameRule.id} value={gameRule.id}>
                      {gameRule.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Entry fee and prize are managed during session lifecycle */}
          </div>

          {createError ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {createError}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={createGameMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createGameMutation.mutate()}
              disabled={
                createGameMutation.isPending || !canCreateGame(createForm)
              }
            >
              <Save className="size-4" />
              Create game
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(statusTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setStatusTarget(null);
            setStatusValue("");
            setStatusError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change game status</DialogTitle>
            <DialogDescription>
              {statusTarget
                ? `Update ${statusTarget.staticCode} - ${statusTarget.name} to the next valid status.`
                : "Select the next game status."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label>Next status</Label>
            <Select
              value={statusValue || undefined}
              onValueChange={(value) => setStatusValue(value as GameStatus)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {(statusTarget
                  ? statusTransitionOptions[statusTarget.status]
                  : []
                ).map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {statusError ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {statusError}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setStatusTarget(null)}
              disabled={statusMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!statusTarget || !statusValue) {
                  return;
                }

                statusMutation.mutate({
                  gameId: statusTarget.id,
                  status: statusValue,
                });
              }}
              disabled={statusMutation.isPending || !statusValue}
            >
              Update status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(startTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setStartTarget(null);
            setStartError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start game</DialogTitle>
            <DialogDescription>
              {startTarget
                ? `Confirm starting ${startTarget.staticCode}. Entry fee is already set in the table.`
                : "Start this game."}
            </DialogDescription>
          </DialogHeader>

          {startTarget ? (
            <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Entry fee</span>
                <span className="font-medium">
                  {formatCurrency(startTarget.entryFee)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Registered</span>
                <span className="font-medium">
                  {startTarget.registeredCartelasCount}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Prize pool</span>
                <span className="font-medium">
                  {formatCurrency(startTarget.prizeAmount)}
                </span>
              </div>
              <p className="text-muted-foreground">
                Prize pool increases by {PRIZE_PER_CARTELA} ETB per registered
                cartela once the round is live.
              </p>
            </div>
          ) : null}

          {startTarget ? (
            blockingSessionId ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {(startError ?? "Another session is blocking.") +
                  " Click 'Cancel blocking session' below to clear it, then try again."}
              </div>
            ) : startError ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {startError}
              </div>
            ) : null
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between">
            {blockingSessionId ? (
              <Button
                variant="destructive"
                size="sm"
                disabled={cancelBlockingMutation.isPending}
                onClick={() => cancelBlockingMutation.mutate(blockingSessionId)}
              >
                {cancelBlockingMutation.isPending
                  ? "Cancelling..."
                  : "Cancel blocking session"}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setStartTarget(null);
                  setStartError(null);
                }}
                disabled={startMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!startTarget || !isValidEntryFee(startTarget.entryFee)) {
                    return;
                  }

                  startMutation.mutate(startTarget.id);
                }}
                disabled={
                  startMutation.isPending ||
                  !startTarget ||
                  !isValidEntryFee(startTarget.entryFee)
                }
              >
                Start game
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(callNumberTarget)}
        onOpenChange={(open) => {
          if (!open) {
            closeCallNumberDialog();
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Call number</DialogTitle>
            <DialogDescription>
              {callNumberTarget
                ? `Call random Bingo numbers for ${callNumberTarget.staticCode}. Keep this modal open during the game and close it only when you are done.`
                : "Record the next called number."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <div className="rounded-2xl border bg-muted/30 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Latest called number
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-tight">
                  {latestModalCalledNumber
                    ? `${latestModalCalledNumber.letter}-${latestModalCalledNumber.number}`
                    : "None yet"}
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  {modalCalledNumbers.length.toLocaleString()} of 75 numbers
                  called
                </div>
                <div className="text-xs text-muted-foreground">
                  {remainingCallNumbers.length.toLocaleString()} remaining
                </div>
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
                      onChange={(event) =>
                        setCallNumberForm(
                          toCalledNumberPayload(Number(event.target.value)),
                        )
                      }
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      const nextCall =
                        getRandomCallNumber(remainingCallNumbers);

                      if (!nextCall) {
                        setCallNumberError(
                          "All 75 numbers have already been called for this game.",
                        );
                        return;
                      }

                      setCallNumberError(null);
                      setCallNumberForm(nextCall);
                    }}
                    disabled={
                      remainingCallNumbers.length === 0 ||
                      callNumberMutation.isPending
                    }
                  >
                    <Target className="size-4" />
                    Pick random
                  </Button>
                  <Button
                    variant={isAutoCalling ? "destructive" : "secondary"}
                    onClick={() => {
                      if (isAutoCalling) {
                        setIsAutoCalling(false);
                        return;
                      }

                      if (remainingCallNumbers.length === 0) {
                        setCallNumberError(
                          "All 75 numbers have already been called for this game.",
                        );
                        return;
                      }

                      setCallNumberError(null);
                      setIsAutoCalling(true);
                    }}
                    disabled={callNumberMutation.isPending}
                  >
                    <Radio className="size-4" />
                    {isAutoCalling
                      ? "Stop auto call"
                      : "Start auto call every 7s"}
                  </Button>
                </div>

                <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  Auto call picks a random remaining number from the full Bingo
                  pool. The matching letter is based on the real Bingo ranges: B
                  1-15, I 16-30, N 31-45, G 46-60, O 61-75.
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label>Called numbers</Label>
                <Badge variant="outline">
                  {modalCalledNumbers.length.toLocaleString()} recorded
                </Badge>
              </div>
              {modalCalledNumbersQuery.isLoading ? (
                <AdminTableSkeleton columns={1} rows={3} />
              ) : modalCalledNumbers.length === 0 ? (
                <AdminEmptyState
                  title="No called numbers yet"
                  description="Start calling numbers manually or turn on the 7 second auto caller."
                />
              ) : (
                <div className="max-h-48 overflow-y-auto rounded-xl border border-border/60 p-3">
                  <div className="flex flex-wrap gap-2">
                    {modalCalledNumbers.map((calledNumber) => (
                      <Badge
                        key={calledNumber.id}
                        variant="outline"
                        className="px-3 py-1 text-xs"
                      >
                        #{calledNumber.order} {calledNumber.letter}-
                        {calledNumber.number}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {callNumberError ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {callNumberError}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={closeCallNumberDialog}>
              Close
            </Button>
            <Button
              onClick={() => {
                if (
                  !callNumberTarget ||
                  !isValidCalledNumber(callNumberForm.number)
                ) {
                  return;
                }

                if (activeSessionId) {
                  callNumberMutation.mutate({
                    sessionId: activeSessionId,
                    payload: toCalledNumberPayload(callNumberForm.number),
                  });
                }
              }}
              disabled={
                isAutoCalling ||
                callNumberMutation.isPending ||
                !isValidCalledNumber(callNumberForm.number)
              }
            >
              <Target className="size-4" />
              Save number
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet
        open={Boolean(selectedGameId)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedGameId(null);
          }
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-2xl">
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>Game details</SheetTitle>
            <SheetDescription>
              Review the current game state, registrations, called numbers, and
              finishing information from the backend source of truth.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 overflow-y-auto p-4">
            {gameDetailQuery.isLoading || calledNumbersQuery.isLoading ? (
              <AdminTableSkeleton columns={1} rows={7} />
            ) : gameDetailQuery.isError || calledNumbersQuery.isError ? (
              <AdminErrorState
                title="Could not load this game"
                description={getApiErrorMessage(
                  gameDetailQuery.error ?? calledNumbersQuery.error,
                  "Please try opening the game again.",
                )}
                onRetry={() => {
                  void gameDetailQuery.refetch();
                  void calledNumbersQuery.refetch();
                }}
              />
            ) : !gameDetailQuery.data ? (
              <AdminEmptyState
                title="No game selected"
                description="Choose a game from the table to see its live details."
              />
            ) : (
              <>
                <Card size="sm">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle>
                          {gameDetailQuery.data.gameRule?.name ??
                            gameDetailQuery.data.name}
                        </CardTitle>
                        <CardDescription>
                          {gameDetailQuery.data.staticCode}
                        </CardDescription>
                      </div>
                      <AdminStatusBadge status={gameDetailQuery.data.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <DetailItem
                      label="Static code"
                      value={gameDetailQuery.data.staticCode}
                    />
                    <DetailItem
                      label="Play code"
                      value={
                        gameDetailQuery.data.status === "NEXT"
                          ? "-"
                          : (gameDetailQuery.data.playCode ?? "-")
                      }
                    />
                    <DetailItem
                      label="Rule"
                      value={
                        gameDetailQuery.data.gameRule?.name ??
                        gameDetailQuery.data.name
                      }
                    />
                    <DetailItem
                      label="Status"
                      value={gameDetailQuery.data.status}
                    />
                    <DetailItem
                      label="Entry fee"
                      value={formatCurrency(gameDetailQuery.data.entryFee)}
                    />
                    <DetailItem
                      label="Prize pool"
                      value={formatCurrency(gameDetailQuery.data.prizeAmount)}
                    />
                    <DetailItem
                      label="Registered"
                      value={gameDetailQuery.data.registeredCartelasCount}
                    />
                    <DetailItem
                      label="Called"
                      value={gameDetailQuery.data.calledNumbersCount}
                    />
                    <DetailItem
                      label="Latest call"
                      value={
                        latestCalledNumber
                          ? `${latestCalledNumber.letter}-${latestCalledNumber.number}`
                          : "-"
                      }
                    />
                    <DetailItem
                      label="Winner"
                      value={gameDetailQuery.data.winnerCartelaId ?? "-"}
                    />
                  </CardContent>
                </Card>

                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Called numbers</CardTitle>
                    <CardDescription>
                      Ordered call history with the latest number highlighted
                      for quick admin verification.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-2xl border bg-muted/30 p-4">
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Latest called number
                      </div>
                      <div className="mt-2 text-3xl font-semibold tracking-tight">
                        {latestCalledNumber
                          ? `${latestCalledNumber.letter}-${latestCalledNumber.number}`
                          : "None yet"}
                      </div>
                    </div>

                    {calledNumbers.length === 0 ? (
                      <AdminEmptyState
                        title="No numbers called yet"
                        description="Once the game is live, called numbers will appear here in order."
                      />
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {calledNumbers.map((calledNumber) => (
                          <Badge
                            key={calledNumber.id}
                            variant="outline"
                            className="px-3 py-1 text-xs"
                          >
                            #{calledNumber.order} {calledNumber.letter}-
                            {calledNumber.number}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

async function invalidateGameQueries(queryClient: QueryClient, gameId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["admin", "games"] }),
    queryClient.invalidateQueries({ queryKey: gameDetailQueryKey(gameId) }),
    queryClient.invalidateQueries({
      queryKey: ["admin", "games", "called-numbers"],
    }),
  ]);
}

function toCalledNumberPayload(number: number): CallNumberPayload {
  return {
    letter: getLetterForNumber(number),
    number,
  };
}

function getLetterForNumber(number: number): CallNumberPayload["letter"] {
  if (number >= 1 && number <= 15) {
    return "B";
  }

  if (number >= 16 && number <= 30) {
    return "I";
  }

  if (number >= 31 && number <= 45) {
    return "N";
  }

  if (number >= 46 && number <= 60) {
    return "G";
  }

  return "O";
}

function getRemainingCallNumbers(calledNumbers: Array<{ number: number }>) {
  const usedNumbers = new Set(
    calledNumbers.map((calledNumber) => calledNumber.number),
  );

  return Array.from({ length: 75 }, (_, index) => index + 1).filter(
    (number) => !usedNumbers.has(number),
  );
}

function getRandomCallNumber(remainingNumbers: number[]) {
  if (remainingNumbers.length === 0) {
    return null;
  }

  const nextNumber =
    remainingNumbers[Math.floor(Math.random() * remainingNumbers.length)];

  return toCalledNumberPayload(nextNumber);
}

function canCreateGame(form: CreateGameFormState) {
  return form.gameRuleId.trim().length > 0;
}

function isValidEntryFee(entryFee: string) {
  const entry = parseMoney(entryFee);
  const prize = parseMoney(PRIZE_PER_CARTELA);
  return (
    entryFee.trim().length > 0 &&
    Number.isFinite(entry) &&
    Number.isFinite(prize) &&
    entry >= prize
  );
}

function parseMoney(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function isValidCalledNumber(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 75;
}
