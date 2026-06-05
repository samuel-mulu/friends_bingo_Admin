"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
} from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import type {
  AdminGame,
  CallNumberPayload,
  GameStatus,
} from "@/lib/api/types";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { ActionDialog } from "@/components/admin/action-dialog";
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
const gamesQueryKey = (page: number) => ["admin", "games", page] as const;
const gameDetailQueryKey = (gameId: string) => ["admin", "games", "detail", gameId] as const;
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
  const [createForm, setCreateForm] =
    useState<CreateGameFormState>(initialCreateGameForm);
  const [createError, setCreateError] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState<AdminGame | null>(null);
  const [statusValue, setStatusValue] = useState<GameStatus | "">("");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [startTarget, setStartTarget] = useState<AdminGame | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [blockingSessionId, setBlockingSessionId] = useState<string | null>(null);
  const [callNumberTarget, setCallNumberTarget] = useState<AdminGame | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [callNumberForm, setCallNumberForm] = useState<CallNumberPayload>({
    letter: "B",
    number: 1,
  });
  const [callNumberError, setCallNumberError] = useState<string | null>(null);
  const [isAutoCalling, setIsAutoCalling] = useState(false);

  const gamesQuery = useQuery({
    queryKey: gamesQueryKey(page),
    queryFn: () => getAdminGames(page, pageSize),
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
  });

  const calledNumbersQuery = useQuery({
    queryKey: activeSessionId
      ? calledNumbersQueryKey(activeSessionId)
      : ["admin", "games", "called-numbers"],
    queryFn: () => getGameCalledNumbers(activeSessionId as string),
    enabled: Boolean(activeSessionId),
  });

  const modalCalledNumbersQuery = useQuery({
    queryKey: callNumberTarget
      ? calledNumbersQueryKey(callNumberTarget.id)
      : ["admin", "games", "called-numbers", "modal"],
    queryFn: () => getGameCalledNumbers(activeSessionId as string),
    enabled: Boolean(callNumberTarget) && Boolean(activeSessionId),
    refetchInterval: isAutoCalling ? 3000 : false,
  });

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
      setCreateError(getApiErrorMessage(error, "The game could not be created."));
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({
      gameId,
      status,
    }: {
      gameId: string;
      status: GameStatus;
    }) => updateAdminGameStatus(gameId, { status }),
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

  const startMutation = useMutation({
    mutationFn: ({ gameId, entryFee }: { gameId: string; entryFee?: string }) =>
      startAdminGame(gameId, entryFee),
    onSuccess: async (_, { gameId }) => {
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
      setStartError(getApiErrorMessage(error, "Could not cancel the blocking session."));
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

  const summary = useMemo(() => {
    const items = gamesQuery.data?.items ?? [];
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
  }, [gamesQuery.data?.items]);

  const calledNumbers = calledNumbersQuery.data?.calledNumbers ?? [];
  const latestCalledNumber = calledNumbers.at(-1) ?? null;
  const modalCalledNumbers = modalCalledNumbersQuery.data?.calledNumbers ?? [];
  const latestModalCalledNumber = modalCalledNumbers.at(-1) ?? null;
  const gameRules = useMemo(() => gameRulesQuery.data ?? [], [gameRulesQuery.data]);
  const defaultGameRuleId = useMemo(
    () => (gameRules.find((rule) => rule.key === "MANUAL") ?? gameRules[0])?.id ?? "",
    [gameRules],
  );
  const remainingCallNumbers = getRemainingCallNumbers(modalCalledNumbers);
  const autoCallActive = isAutoCalling && remainingCallNumbers.length > 0;
  const closeCallNumberDialog = () => {
    setIsAutoCalling(false);
    setCallNumberTarget(null);
    setCallNumberForm({ letter: "B", number: 1 });
    setCallNumberError(null);
  };

  useEffect(() => {
    if (!callNumberTarget && autoCallTimerRef.current) {
      window.clearTimeout(autoCallTimerRef.current);
      autoCallTimerRef.current = null;
    }
  }, [callNumberTarget]);

  useEffect(() => {
    if (!autoCallActive || !callNumberTarget) {
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

      setCallNumberForm(nextCall);
      if (activeSessionId) {
        callNumberMutation.mutate({
          sessionId: activeSessionId,
          payload: nextCall,
        });
      }
    }, 7000);

    return () => {
      if (autoCallTimerRef.current) {
        window.clearTimeout(autoCallTimerRef.current);
        autoCallTimerRef.current = null;
      }
    };
  }, [
    autoCallActive,
    callNumberMutation,
    callNumberTarget,
    remainingCallNumbers,
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Games"
        description="Create games into a numbered queue. Order 1 is always the current NEXT round. When it starts, the queue shifts up automatically."
      />

      <Card>
        <CardHeader className="gap-3 border-b border-border/60">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle>Game operations</CardTitle>
              <CardDescription>
                New games join the end of the queue. Only order 1 can be
                started. Finished or cancelled games leave the queue.
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
          ) : !gamesQuery.data || gamesQuery.data.items.length === 0 ? (
            <AdminEmptyState
              title="No games created yet"
              description="Create the first bingo game to open the operations workflow."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Rule</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Order</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gamesQuery.data.items.map((game) => {
                    const nextStatuses = statusTransitionOptions[game.status];
                    const canStart =
                      game.status === "NEXT" && game.sortOrder === 1;
                    const canReorder = game.status === "NEXT";
                    const canCallNumber = game.status === "PLAYING";

                    return (
                      <TableRow key={game.id}>
                        <TableCell>
                          <span className="font-mono text-xs text-muted-foreground">
                            {game.staticCode}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="min-w-[180px]">
                            <div className="font-medium">
                              {game.gameRule?.name ?? game.name}
                            </div>
                            
                          </div>
                        </TableCell>
                        <TableCell>
                          <AdminStatusBadge status={game.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-medium">
                              {game.status === "NEXT"
                                ? (game.sortOrder ?? "-")
                                : "-"}
                            </span>
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
                          </div>
                        </TableCell>
                        
                        <TableCell>{formatDateTime(game.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
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
                              Start next
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
                pagination={gamesQuery.data.pagination}
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
              Create a NEXT game round from a rule. It will be added to the end of the queue
              automatically with the next order number.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Game rule</Label>
              <Select
                value={createForm.gameRuleId || undefined}
                onValueChange={(value) =>
                  setCreateForm((current) => ({ ...current, gameRuleId: value }))
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
              disabled={createGameMutation.isPending || !canCreateGame(createForm)}
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

      <ActionDialog
        open={Boolean(startTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setStartTarget(null);
            setStartError(null);
          }
        }}
        title="Start game"
        description={
          startTarget
            ? `Start ${startTarget.staticCode} - ${startTarget.name}. This is order 1 in the queue. The next queued game will move up automatically.`
            : "Start this game."
        }
        confirmLabel="Start game"
        field={{ label: "Entry fee (default 10)", placeholder: "10", defaultValue: "10" }}
        errorMessage={
          startTarget
            ? blockingSessionId
              ? `${startError ?? "Another session is blocking."} Click 'Cancel blocking session' below to clear it, then try again.`
              : startError
            : null
        }
        extraContent={
          blockingSessionId ? (
            <Button
              variant="destructive"
              size="sm"
              disabled={cancelBlockingMutation.isPending}
              onClick={() => cancelBlockingMutation.mutate(blockingSessionId)}
            >
              {cancelBlockingMutation.isPending ? "Cancelling..." : "Cancel blocking session"}
            </Button>
          ) : undefined
        }
        onConfirm={(value) => {
          if (!startTarget) {
            return;
          }

          const entryFee = (value ?? "").trim() || undefined;
          startMutation.mutate({ gameId: startTarget.id, entryFee });
        }}
        isPending={startMutation.isPending}
      />

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
                  {modalCalledNumbers.length.toLocaleString()} of 75 numbers called
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
                      const nextCall = getRandomCallNumber(remainingCallNumbers);

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
                      remainingCallNumbers.length === 0 || callNumberMutation.isPending
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
                    {isAutoCalling ? "Stop auto call" : "Start auto call every 7s"}
                  </Button>
                </div>

                <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  Auto call picks a random remaining number from the full Bingo pool.
                  The matching letter is based on the real Bingo ranges: B 1-15,
                  I 16-30, N 31-45, G 46-60, O 61-75.
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
                        #{calledNumber.order} {calledNumber.letter}-{calledNumber.number}
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
            <Button
              variant="outline"
              onClick={closeCallNumberDialog}
            >
              Close
            </Button>
            <Button
              onClick={() => {
                if (!callNumberTarget || !isValidCalledNumber(callNumberForm.number)) {
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
                        <CardDescription>{gameDetailQuery.data.staticCode}</CardDescription>
                      </div>
                      <AdminStatusBadge status={gameDetailQuery.data.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <DetailItem
                      label="Game rule"
                      value={gameDetailQuery.data.gameRule?.name ?? gameDetailQuery.data.name}
                    />
                    <DetailItem
                      label="Rule key"
                      value={gameDetailQuery.data.gameRule?.key ?? gameDetailQuery.data.gameType}
                    />
                    <DetailItem
                      label="Queue order"
                      value={gameDetailQuery.data.sortOrder ?? "-"}
                    />
                    <DetailItem
                      label="Created at"
                      value={formatDateTime(gameDetailQuery.data.createdAt)}
                    />
                  </CardContent>
                </Card>

                {/* Session-specific details are shown when inspecting a live session, not the slot */}

                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Called numbers</CardTitle>
                    <CardDescription>
                      Ordered call history with the latest number highlighted for
                      quick admin verification.
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
                            #{calledNumber.order} {calledNumber.letter}-{calledNumber.number}
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

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

async function invalidateGameQueries(
  queryClient: QueryClient,
  gameId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["admin", "games"] }),
    queryClient.invalidateQueries({ queryKey: gameDetailQueryKey(gameId) }),
    queryClient.invalidateQueries({ queryKey: calledNumbersQueryKey(gameId) }),
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
  const usedNumbers = new Set(calledNumbers.map((calledNumber) => calledNumber.number));

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

function isValidCalledNumber(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 75;
}
