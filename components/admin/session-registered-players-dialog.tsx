"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Grid2X2, ListCollapse, Loader2, Phone } from "lucide-react";

import {
  getSessionCalledNumbers,
  getSessionRegisteredPlayers,
  getSessionWinnerResults,
  type SessionRegisteredCartela,
} from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { SessionWinnerResultItem } from "@/lib/api/types";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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
  "flex max-h-[92vh] w-[min(96vw,64rem)] max-w-[min(96vw,64rem)]! flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,64rem)]!";

type CalledNumberBall = {
  id: string;
  number: number;
  letter: string;
  order: number;
};

function isBlockedCartela(cartela: SessionRegisteredCartela) {
  return Boolean(cartela.blockedAt) || cartela.status === "BLOCKED";
}

function isWinnerCartela(cartela: SessionRegisteredCartela) {
  return cartela.isWinner || cartela.status === "WINNER";
}

function cartelaChipClass(cartela: SessionRegisteredCartela) {
  if (isWinnerCartela(cartela)) {
    return "border-emerald-500/70 bg-emerald-50 text-emerald-900 hover:bg-emerald-100";
  }
  if (isBlockedCartela(cartela)) {
    return "border-red-400/70 bg-red-50 text-red-900 hover:bg-red-100";
  }
  return "hover:bg-muted";
}

export function SessionRegisteredPlayersDialog({
  sessionId,
  label,
  open,
  onOpenChange,
}: {
  sessionId: string | null;
  label?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [selectedCartela, setSelectedCartela] =
    useState<SessionRegisteredCartela | null>(null);
  const [selectedPlayerName, setSelectedPlayerName] = useState<string | null>(
    null,
  );

  const playersQuery = useQuery({
    queryKey: ["admin", "session-registered-players", sessionId],
    queryFn: () => getSessionRegisteredPlayers(sessionId as string),
    enabled: open && Boolean(sessionId),
  });

  const calledQuery = useQuery({
    queryKey: ["admin", "session-called-numbers", sessionId],
    queryFn: () => getSessionCalledNumbers(sessionId as string),
    enabled: open && Boolean(sessionId),
  });

  const winnersQuery = useQuery({
    queryKey: ["admin", "session-winner-results", sessionId],
    queryFn: () => getSessionWinnerResults(sessionId as string),
    enabled: open && Boolean(sessionId),
  });

  const orderedCalls = useMemo(() => {
    const items = [...(calledQuery.data?.calledNumbers ?? [])];
    items.sort((a, b) => b.order - a.order);
    return items;
  }, [calledQuery.data?.calledNumbers]);

  const calledSet = useMemo(
    () =>
      new Set(
        (calledQuery.data?.calledNumbers ?? []).map((item) => item.number),
      ),
    [calledQuery.data?.calledNumbers],
  );

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
            setSelectedCartela(null);
            setSelectedPlayerName(null);
          }
          onOpenChange(next);
        }}
      >
        <DialogContent className={LARGE_DIALOG} showCloseButton>
          <DialogHeader className="border-b border-border/60 px-6 py-4">
            <DialogTitle>Registered players</DialogTitle>
            <DialogDescription>
              {label
                ? `Cartelas for ${label}`
                : "Players and their registered cartelas"}
              {playersQuery.data
                ? ` · ${playersQuery.data.playCode} · ${playersQuery.data.playersCount} player${
                    playersQuery.data.playersCount === 1 ? "" : "s"
                  } · ${playersQuery.data.registeredCartelasCount} cartela${
                    playersQuery.data.registeredCartelasCount === 1 ? "" : "s"
                  }`
                : null}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">
                  Called numbers
                  {calledQuery.data
                    ? ` (${calledQuery.data.totalCount})`
                    : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  Green = winner · Red = blocked · Neutral = registered
                </div>
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
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {orderedCalls.map((call, index) => (
                    <div
                      key={call.id}
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                        index === 0
                          ? "bg-amber-400 text-slate-900"
                          : "bg-slate-800 text-white",
                      )}
                    >
                      {call.letter}-{call.number}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {playersQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading players…
              </div>
            ) : playersQuery.isError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {getApiErrorMessage(playersQuery.error) ||
                  "Could not load registered players."}
              </div>
            ) : !playersQuery.data?.players.length ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No cartelas registered for this game.
              </div>
            ) : (
              <ul className="space-y-3">
                {playersQuery.data.players.map((player) => (
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
                      {player.cartelas.map((cartela) => (
                        <button
                          key={cartela.gameCartelaId}
                          type="button"
                          onClick={() => {
                            setSelectedCartela(cartela);
                            setSelectedPlayerName(
                              player.fullName || "Unknown player",
                            );
                          }}
                          className={cn(
                            "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-mono font-semibold tabular-nums transition-colors",
                            cartelaChipClass(cartela),
                          )}
                          title={
                            isWinnerCartela(cartela)
                              ? "Winner — open details"
                              : isBlockedCartela(cartela)
                                ? "Blocked — open details"
                                : "Registered — open details"
                          }
                        >
                          #{cartela.cartelaNumber}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter className="border-t px-6 py-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SessionCartelaDetailDialog
        cartela={selectedCartela}
        playerName={selectedPlayerName}
        winnerResult={
          selectedCartela
            ? (winnerByCartelaId.get(selectedCartela.gameCartelaId) ??
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
            setSelectedPlayerName(null);
          }
        }}
      />
    </>
  );
}

function SessionCartelaDetailDialog({
  cartela,
  playerName,
  winnerResult,
  orderedCalls,
  calledSet,
  open,
  onOpenChange,
}: {
  cartela: SessionRegisteredCartela | null;
  playerName: string | null;
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

  const statusLabel = cartela
    ? isWinnerCartela(cartela)
      ? "Winner"
      : isBlockedCartela(cartela)
        ? "Blocked"
        : cartela.status
    : "Cartela board";

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
              Cartela #{cartela?.cartelaNumber ?? "—"}
            </DialogTitle>
            <DialogDescription>
              {statusLabel}
              {playerName ? ` · ${playerName}` : ""}
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
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                        index === 0
                          ? "bg-amber-400 text-slate-900"
                          : "bg-slate-800 text-white",
                      )}
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
            {isBlockedCartela(cartela) ? (
              <div className="space-y-1 rounded-xl border border-red-300/60 bg-red-50 px-3 py-2 text-sm text-red-900">
                <div className="flex items-center gap-1.5 font-semibold">
                  <span>Blocked</span>
                  {cartela.blockedAt ? (
                    <span className="font-normal text-red-700">
                      {formatDateTime(cartela.blockedAt)}
                    </span>
                  ) : null}
                </div>
                {cartela.blockReason ? (
                  <div className="text-xs text-red-800">
                    Reason: {cartela.blockReason}
                  </div>
                ) : null}
                {cartela.activeNumberWhenBlocked ? (
                  <div className="text-xs text-red-700">
                    Active number when blocked:{" "}
                    <span className="font-bold">
                      {cartela.activeNumberWhenBlocked.letter}-
                      {cartela.activeNumberWhenBlocked.number}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}

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
