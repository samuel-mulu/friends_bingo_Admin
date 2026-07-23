"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Grid2X2, ListCollapse } from "lucide-react";

import {
  getAdminUserGameHistory,
  getSessionCalledNumbers,
  getSessionWinnerResults,
} from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import type {
  AdminPlayerGameCartela,
  AdminPlayerGameHistoryItem,
  SessionWinnerResultItem,
} from "@/lib/api/types";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { AdminPagination } from "@/components/admin/admin-pagination";
import {
  AdminEmptyState,
  AdminErrorState,
} from "@/components/admin/admin-table-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const pageSize = 10;

const BINGO_ROWS = [
  { letter: "B", start: 1, className: "bg-sky-600 text-white" },
  { letter: "I", start: 16, className: "bg-rose-600 text-white" },
  { letter: "N", start: 31, className: "bg-amber-500 text-white" },
  { letter: "G", start: 46, className: "bg-emerald-600 text-white" },
  { letter: "O", start: 61, className: "bg-violet-600 text-white" },
] as const;

const COLUMN_COLORS = [
  "bg-sky-600 text-white",
  "bg-rose-600 text-white",
  "bg-amber-500 text-white",
  "bg-emerald-600 text-white",
  "bg-violet-600 text-white",
] as const;

const LARGE_DIALOG =
  "flex max-h-[92vh] w-[min(96vw,72rem)] max-w-[min(96vw,72rem)]! flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,72rem)]!";

export function PlayerGameHistoryDialog({
  userId,
  playerName,
  open,
  onOpenChange,
}: {
  userId: string | null;
  playerName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [page, setPage] = useState(1);
  const [selectedSession, setSelectedSession] =
    useState<AdminPlayerGameHistoryItem | null>(null);

  const historyQuery = useQuery({
    queryKey: ["admin", "users", userId, "game-history", page],
    queryFn: () => getAdminUserGameHistory(userId as string, page, pageSize),
    enabled: open && Boolean(userId),
  });

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setPage(1);
            setSelectedSession(null);
          }
          onOpenChange(next);
        }}
      >
        <DialogContent className={LARGE_DIALOG} showCloseButton>
          <DialogHeader className="border-b border-border/60 px-6 py-4">
            <DialogTitle>Game history</DialogTitle>
            <DialogDescription>
              Finished sessions
              {playerName ? ` for ${playerName}` : ""}.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {historyQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading games…</p>
            ) : historyQuery.isError ? (
              <AdminErrorState
                title="Could not load game history"
                description={getApiErrorMessage(
                  historyQuery.error,
                  "Try again in a moment.",
                )}
                onRetry={() => historyQuery.refetch()}
              />
            ) : !historyQuery.data?.items.length ? (
              <AdminEmptyState
                title="No games yet"
                description="This player has not finished any attended games."
              />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Game</TableHead>
                      <TableHead>Finished</TableHead>
                      <TableHead className="text-right">Prize pool</TableHead>
                      <TableHead className="text-right">Cartelas</TableHead>
                      <TableHead className="text-right">Open</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyQuery.data.items.map((item) => {
                      const cartelaCount = item.myCartelas.length;
                      const winnerCount = item.myCartelas.filter(
                        (cartela) => cartela.isWinner,
                      ).length;

                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="font-medium">{item.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.playCode} · {item.status}
                            </div>
                          </TableCell>
                          <TableCell>
                            {formatDateTime(item.finishedAt)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(item.prizeAmount)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-medium tabular-nums">
                              {cartelaCount}{" "}
                              {cartelaCount === 1 ? "cartela" : "cartelas"}
                            </span>
                            {winnerCount > 0 ? (
                              <div className="text-xs text-emerald-700">
                                {winnerCount} winner
                                {winnerCount === 1 ? "" : "s"}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedSession(item)}
                            >
                              Details
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <AdminPagination
                  pagination={historyQuery.data.pagination}
                  onPageChange={setPage}
                />
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <PlayerGameSessionDetailDialog
        session={selectedSession}
        open={Boolean(selectedSession)}
        onOpenChange={(next) => {
          if (!next) {
            setSelectedSession(null);
          }
        }}
      />
    </>
  );
}

function PlayerGameSessionDetailDialog({
  session,
  open,
  onOpenChange,
}: {
  session: AdminPlayerGameHistoryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [showBoard, setShowBoard] = useState(false);
  const [selectedCartela, setSelectedCartela] =
    useState<AdminPlayerGameCartela | null>(null);
  const sessionId = session?.sessionId ?? session?.id ?? null;

  const calledQuery = useQuery({
    queryKey: ["games", "sessions", sessionId, "called-numbers"],
    queryFn: () => getSessionCalledNumbers(sessionId as string),
    enabled: open && Boolean(sessionId),
  });

  const winnersQuery = useQuery({
    queryKey: ["games", "sessions", sessionId, "winner-results"],
    queryFn: () => getSessionWinnerResults(sessionId as string),
    enabled: open && Boolean(sessionId),
  });

  const calledSet = useMemo(
    () =>
      new Set(
        (calledQuery.data?.calledNumbers ?? []).map((item) => item.number),
      ),
    [calledQuery.data?.calledNumbers],
  );

  const orderedCalls = useMemo(() => {
    const items = [...(calledQuery.data?.calledNumbers ?? [])];
    items.sort((a, b) => b.order - a.order);
    return items;
  }, [calledQuery.data?.calledNumbers]);

  const winnerByCartelaId = useMemo(() => {
    const map = new Map<string, SessionWinnerResultItem>();
    for (const result of winnersQuery.data?.winnerResults ?? []) {
      map.set(result.gameCartelaId, result);
      map.set(result.cartelaId, result);
    }
    return map;
  }, [winnersQuery.data?.winnerResults]);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setShowBoard(false);
            setSelectedCartela(null);
          }
          onOpenChange(next);
        }}
      >
        <DialogContent className={LARGE_DIALOG} showCloseButton>
          <DialogHeader className="border-b border-border/60 px-6 py-4">
            <DialogTitle>{session?.name ?? "Game details"}</DialogTitle>
            <DialogDescription>
              {session
                ? `${session.playCode} · ${formatDateTime(session.finishedAt)}`
                : null}
            </DialogDescription>
          </DialogHeader>

          {session ? (
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric
                  label="Prize pool"
                  value={formatCurrency(session.prizeAmount)}
                />
                <Metric
                  label="Entry fee"
                  value={formatCurrency(session.entryFee)}
                />
                <Metric
                  label="Called"
                  value={String(
                    calledQuery.data?.totalCount ?? session.calledNumbersCount,
                  )}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-base font-semibold">
                    Player cartelas ({session.myCartelas.length})
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Tap a cartela to open the board
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {session.myCartelas.map((cartela) => {
                    const winner =
                      winnerByCartelaId.get(cartela.id) ??
                      winnerByCartelaId.get(cartela.cartelaId);
                    return (
                      <button
                        key={cartela.id}
                        type="button"
                        onClick={() => setSelectedCartela(cartela)}
                        className={cn(
                          "rounded-xl border px-4 py-3 text-left transition-colors hover:bg-muted/40",
                          cartela.isWinner
                            ? "border-amber-400/70 bg-amber-50/70"
                            : "border-border/60",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-lg font-bold">
                            #{cartela.cartela.number}
                          </div>
                          <Badge
                            variant={cartela.isWinner ? "default" : "secondary"}
                          >
                            {cartela.isWinner ? "Winner" : cartela.status}
                          </Badge>
                        </div>
                        {winner ? (
                          <div className="mt-1 text-sm font-semibold text-emerald-700">
                            Prize {formatCurrency(winner.amount)}
                          </div>
                        ) : null}
                        <div className="mt-2 text-xs text-muted-foreground">
                          Open cartela board
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-border/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">Called numbers</div>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    aria-label={
                      showBoard
                        ? "Hide called numbers board"
                        : "Show called numbers board"
                    }
                    onClick={() => setShowBoard((value) => !value)}
                  >
                    {showBoard ? (
                      <ListCollapse className="size-4" />
                    ) : (
                      <Grid2X2 className="size-4" />
                    )}
                  </Button>
                </div>

                {calledQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">
                    Loading called numbers…
                  </p>
                ) : calledQuery.isError ? (
                  <p className="text-sm text-muted-foreground">
                    Called numbers unavailable for this session.
                  </p>
                ) : orderedCalls.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No called numbers stored for this game.
                  </p>
                ) : (
                  <>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {orderedCalls.map((call, index) => (
                        <div
                          key={call.id}
                          className={`flex size-10 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                            index === 0
                              ? "bg-amber-400 text-slate-900"
                              : "bg-slate-800 text-white"
                          }`}
                        >
                          {call.letter}-{call.number}
                        </div>
                      ))}
                    </div>
                    {showBoard ? (
                      <div className="space-y-1 rounded-lg bg-muted/40 p-2">
                        {BINGO_ROWS.map((row) => (
                          <div
                            key={row.letter}
                            className="flex items-center gap-1"
                          >
                            <div
                              className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-black ${row.className}`}
                            >
                              {row.letter}
                            </div>
                            <div className="flex min-w-0 flex-1 gap-0.5">
                              {Array.from({ length: 15 }, (_, index) => {
                                const number = row.start + index;
                                const isCalled = calledSet.has(number);
                                return (
                                  <div
                                    key={number}
                                    className={`flex h-5 min-w-0 flex-1 items-center justify-center rounded text-[9px] font-bold ${
                                      isCalled
                                        ? row.className
                                        : "bg-background text-muted-foreground"
                                    }`}
                                  >
                                    {number}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <PlayerCartelaBoardDialog
        cartela={selectedCartela}
        winnerResult={
          selectedCartela
            ? (winnerByCartelaId.get(selectedCartela.id) ??
              winnerByCartelaId.get(selectedCartela.cartelaId) ??
              null)
            : null
        }
        orderedCalls={orderedCalls}
        calledSet={calledSet}
        open={Boolean(selectedCartela)}
        onOpenChange={(next) => {
          if (!next) {
            setSelectedCartela(null);
          }
        }}
      />
    </>
  );
}

type CalledNumberBall = {
  id: string;
  number: number;
  letter: string;
  order: number;
};

function PlayerCartelaBoardDialog({
  cartela,
  winnerResult,
  orderedCalls,
  calledSet,
  open,
  onOpenChange,
}: {
  cartela: AdminPlayerGameCartela | null;
  winnerResult: SessionWinnerResultItem | null;
  orderedCalls: CalledNumberBall[];
  calledSet: Set<number>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [showCalledBoard, setShowCalledBoard] = useState(false);

  const columns = useMemo(() => {
    if (!cartela) {
      return null;
    }
    const source = winnerResult ?? cartela.cartela;
    return [source.b, source.i, source.n, source.g, source.o] as Array<
      Array<number | string>
    >;
  }, [cartela, winnerResult]);

  const winningCells = useMemo(() => {
    const set = new Set<string>();
    for (const pattern of winnerResult?.completedPatterns ?? []) {
      for (const [row, col] of pattern.cells ?? []) {
        set.add(`${row}:${col}`);
      }
    }
    return set;
  }, [winnerResult]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setShowCalledBoard(false);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="flex max-h-[92vh] w-[min(96vw,36rem)] max-w-[min(96vw,36rem)]! flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,36rem)]!"
        showCloseButton
      >
        <DialogHeader className="space-y-3 border-b border-border/60 px-6 py-4">
          <div>
            <DialogTitle>
              Cartela #{cartela?.cartela.number ?? "—"}
            </DialogTitle>
            <DialogDescription>
              {cartela?.isWinner
                ? "Winner cartela"
                : (cartela?.status ?? "Cartela board")}
              {winnerResult
                ? ` · Prize ${formatCurrency(winnerResult.amount)}`
                : ""}
            </DialogDescription>
          </div>

          <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3 text-left">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Called numbers ({orderedCalls.length})
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label={
                  showCalledBoard
                    ? "Hide called numbers board"
                    : "Show called numbers board"
                }
                onClick={() => setShowCalledBoard((value) => !value)}
              >
                {showCalledBoard ? (
                  <ListCollapse className="size-4" />
                ) : (
                  <Grid2X2 className="size-4" />
                )}
              </Button>
            </div>

            {orderedCalls.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No called numbers for this game.
              </p>
            ) : (
              <>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {orderedCalls.map((call, index) => (
                    <div
                      key={call.id}
                      className={`flex size-10 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                        index === 0
                          ? "bg-amber-400 text-slate-900"
                          : "bg-slate-800 text-white"
                      }`}
                    >
                      {call.letter}-{call.number}
                    </div>
                  ))}
                </div>
                {showCalledBoard ? (
                  <div className="space-y-1 rounded-lg bg-background/80 p-2">
                    {BINGO_ROWS.map((row) => (
                      <div key={row.letter} className="flex items-center gap-1">
                        <div
                          className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-black ${row.className}`}
                        >
                          {row.letter}
                        </div>
                        <div className="flex min-w-0 flex-1 gap-0.5">
                          {Array.from({ length: 15 }, (_, index) => {
                            const number = row.start + index;
                            const isCalled = calledSet.has(number);
                            return (
                              <div
                                key={number}
                                className={`flex h-5 min-w-0 flex-1 items-center justify-center rounded text-[9px] font-bold ${
                                  isCalled
                                    ? row.className
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {number}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </DialogHeader>

        {cartela && columns ? (
          <div className="space-y-4 overflow-y-auto px-6 py-4">
            {winnerResult?.lastCalledNumber ? (
              <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                Winning ball{" "}
                {winnerResult.lastCalledNumber.letter}-
                {winnerResult.lastCalledNumber.number}
              </div>
            ) : null}

            <div className="overflow-hidden rounded-2xl border border-border/70 bg-slate-950 p-3 text-white shadow-sm">
              <div className="mb-2 grid grid-cols-5 gap-1">
                {["B", "I", "N", "G", "O"].map((letter, index) => (
                  <div
                    key={letter}
                    className={cn(
                      "rounded-md py-1 text-center text-sm font-black",
                      COLUMN_COLORS[index],
                    )}
                  >
                    {letter}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-5 gap-1">
                {Array.from({ length: 5 }, (_, row) =>
                  Array.from({ length: 5 }, (_, col) => {
                    const raw = columns[col]?.[row];
                    const isFree =
                      raw === "FREE" ||
                      raw === "free" ||
                      (col === 2 && row === 2 && (raw == null || raw === ""));
                    const value = isFree ? "FREE" : String(raw ?? "");
                    const numeric =
                      !isFree && Number.isFinite(Number(raw))
                        ? Number(raw)
                        : null;
                    const isWinning = winningCells.has(`${row}:${col}`);
                    const isCalled =
                      numeric != null ? calledSet.has(numeric) : isFree;
                    const isWinningBall =
                      winnerResult?.winningBallCellIndex != null &&
                      winnerResult.winningBallCellIndex === row * 5 + col;

                    return (
                      <div
                        key={`${row}-${col}`}
                        className={cn(
                          "flex aspect-square items-center justify-center rounded-md text-sm font-bold",
                          isWinningBall
                            ? "bg-amber-400 text-slate-950 ring-2 ring-white"
                            : isWinning
                              ? "bg-emerald-500 text-white"
                              : isCalled
                                ? COLUMN_COLORS[col]
                                : "bg-slate-800 text-slate-200",
                        )}
                      >
                        {value}
                      </div>
                    );
                  }),
                )}
              </div>
            </div>

            {winnerResult?.completedPatterns?.length ? (
              <div className="space-y-1">
                <div className="text-sm font-semibold">Completed patterns</div>
                <div className="flex flex-wrap gap-2">
                  {winnerResult.completedPatterns.map((pattern, index) => (
                    <Badge key={`${pattern.type}-${index}`} variant="outline">
                      {pattern.key ?? pattern.type}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
