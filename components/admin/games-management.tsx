"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
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
  createAdminGame,
  getAdminGames,
  getGameCalledNumbers,
  getGameDetail,
  startAdminGame,
  updateAdminGameStatus,
} from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { AdminGame, CallNumberPayload, GameStatus } from "@/lib/api/types";
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

const gameTypeOptions = [
  "HALF_HOUSE",
  "FULL_HOUSE",
  "T_SHAPE",
  "L_SHAPE",
  "X_SHAPE",
  "TIEZAZ",
] as const;

const statusTransitionOptions: Record<GameStatus, GameStatus[]> = {
  NEXT: ["CHECKING", "CANCELLED"],
  CHECKING: ["CANCELLED"],
  PLAYING: ["FINISHED"],
  FINISHED: [],
  CANCELLED: [],
};

const callLetterOptions = ["B", "I", "N", "G", "O"] as const;

type CreateGameFormState = {
  name: string;
  gameType: string;
  entryFee: string;
  prizeAmount: string;
  startsAt: string;
};

const initialCreateGameForm: CreateGameFormState = {
  name: "",
  gameType: "HALF_HOUSE",
  entryFee: "",
  prizeAmount: "",
  startsAt: "",
};

export function GamesManagement() {
  const queryClient = useQueryClient();
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
  const [callNumberTarget, setCallNumberTarget] = useState<AdminGame | null>(null);
  const [callNumberForm, setCallNumberForm] = useState<CallNumberPayload>({
    letter: "B",
    number: 1,
  });
  const [callNumberError, setCallNumberError] = useState<string | null>(null);

  const gamesQuery = useQuery({
    queryKey: gamesQueryKey(page),
    queryFn: () => getAdminGames(page, pageSize),
  });

  const gameDetailQuery = useQuery({
    queryKey: selectedGameId
      ? gameDetailQueryKey(selectedGameId)
      : ["admin", "games", "detail"],
    queryFn: () => getGameDetail(selectedGameId as string),
    enabled: Boolean(selectedGameId),
  });

  const calledNumbersQuery = useQuery({
    queryKey: selectedGameId
      ? calledNumbersQueryKey(selectedGameId)
      : ["admin", "games", "called-numbers"],
    queryFn: () => getGameCalledNumbers(selectedGameId as string),
    enabled: Boolean(selectedGameId),
  });

  const createGameMutation = useMutation({
    mutationFn: () =>
      createAdminGame({
        name: createForm.name.trim(),
        gameType: createForm.gameType,
        entryFee: createForm.entryFee.trim(),
        prizeAmount: createForm.prizeAmount.trim(),
        startsAt: toIsoDateTime(createForm.startsAt),
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
      await invalidateGameQueries(queryClient, variables.gameId);
    },
    onError: (error) => {
      setStatusError(
        getApiErrorMessage(error, "The game status could not be updated."),
      );
    },
  });

  const startMutation = useMutation({
    mutationFn: (gameId: string) => startAdminGame(gameId),
    onSuccess: async (_, gameId) => {
      setStartTarget(null);
      setStartError(null);
      await invalidateGameQueries(queryClient, gameId);
    },
    onError: (error) => {
      setStartError(getApiErrorMessage(error, "The game could not be started."));
    },
  });

  const callNumberMutation = useMutation({
    mutationFn: ({
      gameId,
      payload,
    }: {
      gameId: string;
      payload: CallNumberPayload;
    }) => callAdminGameNumber(gameId, payload),
    onSuccess: async (_, variables) => {
      setCallNumberTarget(null);
      setCallNumberForm({ letter: "B", number: 1 });
      setCallNumberError(null);
      await invalidateGameQueries(queryClient, variables.gameId);
    },
    onError: (error) => {
      setCallNumberError(
        getApiErrorMessage(error, "The called number could not be recorded."),
      );
    },
  });

  const summary = useMemo(() => {
    const items = gamesQuery.data?.items ?? [];

    return {
      live: items.filter((game) => game.status === "PLAYING").length,
      checking: items.filter((game) => game.status === "CHECKING").length,
    };
  }, [gamesQuery.data?.items]);

  const calledNumbers = calledNumbersQuery.data?.calledNumbers ?? [];
  const latestCalledNumber = calledNumbers.at(-1) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Games"
        description="Create upcoming bingo games, control status changes, start live sessions, and record called numbers from one operational workspace."
      />

      <Card>
        <CardHeader className="gap-3 border-b border-border/60">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle>Game operations</CardTitle>
              <CardDescription>
                Manage the full setup and live control flow for each game
                without leaving the admin dashboard.
              </CardDescription>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
                <div className="font-medium text-foreground">
                  {summary.live.toLocaleString()} live now
                </div>
                <div className="text-muted-foreground">
                  {summary.checking.toLocaleString()} ready to start
                </div>
              </div>
              <Button
                onClick={() => {
                  setCreateError(null);
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
            <AdminTableSkeleton columns={9} />
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
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Entry fee</TableHead>
                    <TableHead className="text-right">Prize</TableHead>
                    <TableHead>Starts</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gamesQuery.data.items.map((game) => {
                    const nextStatuses = statusTransitionOptions[game.status];
                    const canStart = game.status === "CHECKING";
                    const canCallNumber = game.status === "PLAYING";

                    return (
                      <TableRow key={game.id}>
                        <TableCell>
                          <span className="font-mono text-xs text-muted-foreground">
                            {game.code}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="min-w-[180px]">
                            <div className="font-medium">{game.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {game.registeredCartelasCount.toLocaleString()} registrations
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{game.gameType}</Badge>
                        </TableCell>
                        <TableCell>
                          <AdminStatusBadge status={game.status} />
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(game.entryFee)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(game.prizeAmount)}
                        </TableCell>
                        <TableCell>{formatDateTime(game.startsAt)}</TableCell>
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
                              Start
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={!canCallNumber}
                              onClick={() => {
                                setCallNumberError(null);
                                setCallNumberTarget(game);
                                setCallNumberForm({ letter: "B", number: 1 });
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
              Set up the game basics now. The backend will generate the unique
              game code automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="game-name">Game name</Label>
              <Input
                id="game-name"
                placeholder="Evening Bingo"
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Game type</Label>
              <Select
                value={createForm.gameType}
                onValueChange={(value) =>
                  setCreateForm((current) => ({ ...current, gameType: value }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select game type" />
                </SelectTrigger>
                <SelectContent>
                  {gameTypeOptions.map((gameType) => (
                    <SelectItem key={gameType} value={gameType}>
                      {gameType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="starts-at">Starts at</Label>
              <Input
                id="starts-at"
                type="datetime-local"
                value={createForm.startsAt}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    startsAt: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entry-fee">Entry fee</Label>
              <Input
                id="entry-fee"
                inputMode="decimal"
                placeholder="10"
                value={createForm.entryFee}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    entryFee: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prize-amount">Prize amount</Label>
              <Input
                id="prize-amount"
                inputMode="decimal"
                placeholder="500"
                value={createForm.prizeAmount}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    prizeAmount: event.target.value,
                  }))
                }
              />
            </div>
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
                createGameMutation.isPending ||
                !canCreateGame(createForm)
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
                ? `Update ${statusTarget.code} - ${statusTarget.name} to the next valid status.`
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
            ? `Start ${startTarget.code} - ${startTarget.name}. The game will move from CHECKING to PLAYING and become ready for called numbers.`
            : "Start this game."
        }
        confirmLabel="Start game"
        errorMessage={startTarget ? startError : null}
        onConfirm={() => {
          if (!startTarget) {
            return;
          }

          startMutation.mutate(startTarget.id);
        }}
        isPending={startMutation.isPending}
      />

      <Dialog
        open={Boolean(callNumberTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setCallNumberTarget(null);
            setCallNumberForm({ letter: "B", number: 1 });
            setCallNumberError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Call number</DialogTitle>
            <DialogDescription>
              {callNumberTarget
                ? `Record the next called number for ${callNumberTarget.code}. The backend will assign the correct order automatically.`
                : "Record the next called number."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
            <div className="space-y-2">
              <Label>Letter</Label>
              <Select
                value={callNumberForm.letter}
                onValueChange={(value) =>
                  setCallNumberForm((current) => ({
                    ...current,
                    letter: value,
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Letter" />
                </SelectTrigger>
                <SelectContent>
                  {callLetterOptions.map((letter) => (
                    <SelectItem key={letter} value={letter}>
                      {letter}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  setCallNumberForm((current) => ({
                    ...current,
                    number: Number(event.target.value),
                  }))
                }
              />
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
              onClick={() => setCallNumberTarget(null)}
              disabled={callNumberMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!callNumberTarget || !isValidCalledNumber(callNumberForm.number)) {
                  return;
                }

                callNumberMutation.mutate({
                  gameId: callNumberTarget.id,
                  payload: callNumberForm,
                });
              }}
              disabled={
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
                        <CardTitle>{gameDetailQuery.data.name}</CardTitle>
                        <CardDescription>{gameDetailQuery.data.code}</CardDescription>
                      </div>
                      <AdminStatusBadge status={gameDetailQuery.data.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <DetailItem label="Game type" value={gameDetailQuery.data.gameType} />
                    <DetailItem
                      label="Registrations"
                      value={gameDetailQuery.data.registeredCartelasCount.toLocaleString()}
                    />
                    <DetailItem
                      label="Entry fee"
                      value={formatCurrency(gameDetailQuery.data.entryFee)}
                    />
                    <DetailItem
                      label="Prize amount"
                      value={formatCurrency(gameDetailQuery.data.prizeAmount)}
                    />
                    <DetailItem
                      label="Starts at"
                      value={formatDateTime(gameDetailQuery.data.startsAt)}
                    />
                    <DetailItem
                      label="Created at"
                      value={formatDateTime(gameDetailQuery.data.createdAt)}
                    />
                  </CardContent>
                </Card>

                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Live progress</CardTitle>
                    <CardDescription>
                      Useful checkpoints for monitoring start and finish state.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <DetailItem
                      label="Started at"
                      value={formatDateTime(gameDetailQuery.data.startedAt)}
                    />
                    <DetailItem
                      label="Finished at"
                      value={formatDateTime(gameDetailQuery.data.finishedAt)}
                    />
                    <DetailItem
                      label="Winner cartela"
                      value={gameDetailQuery.data.winnerCartelaId ?? "-"}
                    />
                    <DetailItem
                      label="Called numbers"
                      value={calledNumbers.length.toLocaleString()}
                    />
                  </CardContent>
                </Card>

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

function canCreateGame(form: CreateGameFormState) {
  return (
    form.name.trim().length > 0 &&
    form.gameType.trim().length > 0 &&
    form.entryFee.trim().length > 0 &&
    form.prizeAmount.trim().length > 0 &&
    form.startsAt.trim().length > 0
  );
}

function isValidCalledNumber(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 75;
}

function toIsoDateTime(value: string) {
  return new Date(value).toISOString();
}
