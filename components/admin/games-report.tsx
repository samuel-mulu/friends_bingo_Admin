"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Gamepad2,
  Loader2,
  Target,
  Ticket,
  Trophy,
  Users,
} from "lucide-react";

import { getGamesReport } from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { GamesReportWinner } from "@/lib/api/types";
import { adminToast } from "@/lib/admin/admin-toast";
import { exportGamesReportPdf } from "@/lib/admin/export-games-report-pdf";
import { formatTelegramWinnerMessage } from "@/lib/admin/format-telegram-winner-message";
import {
  deriveFinancialRange,
  formatDayLabel,
  formatMonthLabel,
  getCurrentMonthKey,
  getTodayDateKey,
  isDayAtOrAfterToday,
  isMonthAtOrAfterCurrent,
  shiftDayKey,
  shiftMonthKey,
  type FinancialPeriodMode,
} from "@/lib/admin/financial-period";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { AdminEmptyState } from "@/components/admin/admin-table-state";
import { ReportDateRangeFilter } from "@/components/admin/report-date-range-filter";
import { ReportMetricCard } from "@/components/admin/report-metric-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const gamesReportQueryKey = (from: string, to: string) =>
  ["admin", "reports", "games", from, to] as const;

export function GamesReportView() {
  const [mode, setMode] = useState<FinancialPeriodMode>("daily");
  const [dayKey, setDayKey] = useState(getTodayDateKey);
  const [monthKey, setMonthKey] = useState(getCurrentMonthKey);
  const [rangeFrom, setRangeFrom] = useState(() =>
    shiftDayKey(getTodayDateKey(), -29),
  );
  const [rangeTo, setRangeTo] = useState(getTodayDateKey);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const { from, to } = useMemo(
    () =>
      deriveFinancialRange({
        mode,
        dayKey,
        monthKey,
        rangeFrom,
        rangeTo,
      }),
    [mode, dayKey, monthKey, rangeFrom, rangeTo],
  );

  const gamesQuery = useQuery({
    queryKey: gamesReportQueryKey(from, to),
    queryFn: () =>
      getGamesReport({
        from: from || undefined,
        to: to || undefined,
      }),
    placeholderData: (previous) => previous,
  });

  const activityChartData = useMemo(
    () =>
      gamesQuery.data
        ? [
            { label: "Games Created", value: gamesQuery.data.gamesCreated },
            { label: "Games Finished", value: gamesQuery.data.gamesFinished },
            {
              label: "Registrations",
              value: gamesQuery.data.totalRegistrations,
            },
          ]
        : [],
    [gamesQuery.data],
  );

  const moneyChartData = useMemo(
    () =>
      gamesQuery.data
        ? [
            {
              label: "Entry Fees",
              value: Number(gamesQuery.data.totalEntryFees),
            },
            {
              label: "Prize Amount",
              value: Number(gamesQuery.data.totalPrizeAmount),
            },
          ]
        : [],
    [gamesQuery.data],
  );

  const winnerRows = useMemo(() => {
    const winners = gamesQuery.data?.winners ?? [];
    const gameOrder: string[] = [];
    const byGame = new Map<string, GamesReportWinner[]>();

    for (const winner of winners) {
      const existing = byGame.get(winner.gameId);
      if (existing) {
        existing.push(winner);
      } else {
        gameOrder.push(winner.gameId);
        byGame.set(winner.gameId, [winner]);
      }
    }

    const gameIndexById = new Map(
      gameOrder.map((gameId, index) => [gameId, index + 1]),
    );

    return winners.map((winner) => {
      const gameWinners = byGame.get(winner.gameId) ?? [winner];
      return {
        winner,
        gameIndex: gameIndexById.get(winner.gameId) ?? 0,
        gameWinners,
        isFirstOfGame: gameWinners[0]?.winnerCartelaId === winner.winnerCartelaId,
      };
    });
  }, [gamesQuery.data?.winners]);

  const copyGameForTelegram = async (gameWinners: GamesReportWinner[]) => {
    const message = formatTelegramWinnerMessage(gameWinners);
    if (!message) {
      adminToast.error("Nothing to copy for this game.");
      return;
    }

    try {
      await navigator.clipboard.writeText(message);
      adminToast.success("Telegram winner message copied.");
    } catch {
      adminToast.error("Could not copy to clipboard.");
    }
  };

  const canGoNext =
    mode === "daily"
      ? !isDayAtOrAfterToday(dayKey)
      : mode === "monthly"
        ? !isMonthAtOrAfterCurrent(monthKey)
        : false;

  const periodLabel =
    mode === "daily"
      ? formatDayLabel(dayKey)
      : mode === "monthly"
        ? formatMonthLabel(monthKey)
        : `${rangeFrom || "…"} → ${rangeTo || "…"}`;

  const modeLabel =
    mode === "daily" ? "Daily" : mode === "monthly" ? "Monthly" : "Custom range";

  const exportPdf = async () => {
    if (!gamesQuery.data) {
      adminToast.error("Load the game report before exporting.");
      return;
    }

    setIsExportingPdf(true);
    try {
      exportGamesReportPdf({
        report: gamesQuery.data,
        periodLabel,
        modeLabel,
        from,
        to,
      });
      adminToast.success("Game report PDF downloaded.");
    } catch (error) {
      adminToast.error(
        getApiErrorMessage(error, "Could not generate the PDF report."),
      );
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["daily", "Daily"],
            ["monthly", "Monthly"],
            ["range", "Range"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={mode === value ? "default" : "outline"}
            onClick={() => setMode(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {mode === "range" ? (
        <ReportDateRangeFilter
          from={rangeFrom}
          to={rangeTo}
          onFromChange={setRangeFrom}
          onToChange={setRangeTo}
          onReset={() => {
            setRangeFrom(shiftDayKey(getTodayDateKey(), -29));
            setRangeTo(getTodayDateKey());
          }}
        />
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Previous period"
              onClick={() => {
                if (mode === "daily") {
                  setDayKey((current) => shiftDayKey(current, -1));
                } else {
                  setMonthKey((current) => shiftMonthKey(current, -1));
                }
              }}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="min-w-[12rem] text-center">
              <p className="text-sm font-semibold text-foreground">
                {periodLabel}
              </p>
              <p className="text-xs text-muted-foreground">
                {mode === "daily" ? "Single day" : "Calendar month"}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Next period"
              disabled={!canGoNext}
              onClick={() => {
                if (mode === "daily") {
                  setDayKey((current) => {
                    const next = shiftDayKey(current, 1);
                    return next <= getTodayDateKey() ? next : current;
                  });
                } else {
                  setMonthKey((current) => {
                    const next = shiftMonthKey(current, 1);
                    return next <= getCurrentMonthKey() ? next : current;
                  });
                }
              }}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                if (mode === "daily") {
                  setDayKey(getTodayDateKey());
                } else {
                  setMonthKey(getCurrentMonthKey());
                }
              }}
            >
              {mode === "daily" ? "Today" : "This month"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!gamesQuery.data || isExportingPdf}
              onClick={() => void exportPdf()}
            >
              {isExportingPdf ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {isExportingPdf ? "Preparing PDF…" : "Export PDF"}
            </Button>
          </div>
        </div>
      )}

      {mode === "range" ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={!gamesQuery.data || isExportingPdf}
            onClick={() => void exportPdf()}
          >
            {isExportingPdf ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            {isExportingPdf ? "Preparing PDF…" : "Export PDF"}
          </Button>
        </div>
      ) : null}

      {gamesQuery.isLoading ? (
        <GamesReportLoading />
      ) : gamesQuery.isError ? (
        <Card className="border-destructive/20 bg-destructive/5">
          <CardHeader>
            <CardTitle>Could not load game report</CardTitle>
            <CardDescription>
              {getApiErrorMessage(
                gamesQuery.error,
                "Something went wrong while loading the game report.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => gamesQuery.refetch()}>Try again</Button>
          </CardContent>
        </Card>
      ) : !gamesQuery.data ? null : (
        <div className="space-y-6">
          <Card className="border-primary/20 bg-[linear-gradient(135deg,rgba(13,92,99,0.08)_0%,rgba(31,122,140,0.04)_100%)]">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                  <Users className="size-5" />
                </div>
                <div>
                  <CardTitle>Average players per game</CardTitle>
                  <CardDescription>
                    Registration density for games created in this period
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold text-primary">
                {gamesQuery.data.averagePlayersPerGame.toFixed(2)}
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <ReportMetricCard
              title="Games Created"
              value={gamesQuery.data.gamesCreated.toLocaleString()}
              description="Games set up during the selected period"
              icon={<Gamepad2 className="size-5" />}
            />
            <ReportMetricCard
              title="Games Finished"
              value={gamesQuery.data.gamesFinished.toLocaleString()}
              description="Finished games with a recorded completion state"
              icon={<Trophy className="size-5" />}
            />
            <ReportMetricCard
              title="Total Registrations"
              value={gamesQuery.data.totalRegistrations.toLocaleString()}
              description="Registered cartelas across all created games"
              icon={<Ticket className="size-5" />}
            />
            <ReportMetricCard
              title="Total Entry Fees"
              value={formatCurrency(gamesQuery.data.totalEntryFees)}
              description="Real-money entry fees from paid registrations"
              icon={<Target className="size-5" />}
            />
            <ReportMetricCard
              title="Bonus Entry Value"
              value={formatCurrency(gamesQuery.data.bonusEntryValueTotal)}
              description={`${gamesQuery.data.bonusCartelasUsed.toLocaleString()} bonus cartelas used`}
              icon={<Ticket className="size-5" />}
            />
            <ReportMetricCard
              title="Total Prize Amount"
              value={formatCurrency(gamesQuery.data.totalPrizeAmount)}
              description="Prize value configured for created games"
              icon={<Trophy className="size-5" />}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
            <Card className="min-h-[360px]">
              <CardHeader>
                <CardTitle>Game activity snapshot</CardTitle>
                <CardDescription>
                  Quick comparison of created games, finished games, and total
                  registrations in the selected period.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activityChartData}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.18} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Bar
                      dataKey="value"
                      fill="var(--color-chart-2)"
                      radius={[10, 10, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="min-h-[360px]">
              <CardHeader>
                <CardTitle>Money setup overview</CardTitle>
                <CardDescription>
                  Entry fee volume compared with the total configured prize
                  value in the selected period.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={moneyChartData}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.18} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(value) => formatCurrency(String(value ?? 0))}
                    />
                    <Legend />
                    <Bar
                      dataKey="value"
                      fill="var(--color-chart-4)"
                      radius={[10, 10, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Winners</CardTitle>
              <CardDescription>
                Finished games with recorded winners in the selected period,
                newest first. Shared wins list every winning cartela and its
                prize share. Use copy for a Telegram community post.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pt-0">
              {gamesQuery.data.winners.length === 0 ? (
                <AdminEmptyState
                  title="No winners in this period"
                  description="Finished games with winners will appear here once the selected period includes completed results."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-right">#</TableHead>
                      <TableHead>Game</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Winner</TableHead>
                      <TableHead>Cartela</TableHead>
                      <TableHead className="text-right">Prize share</TableHead>
                      <TableHead>Finished</TableHead>
                      <TableHead className="w-14 text-right">Copy</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {winnerRows.map(
                      ({ winner, gameIndex, gameWinners, isFirstOfGame }) => {
                        const winnersInGame = winner.winnersInGame ?? 1;
                        const sessionPrize = winner.sessionPrizeAmount;

                        return (
                          <TableRow
                            key={
                              winner.winnerCartelaId ??
                              `${winner.gameId}-${winner.cartelaNumber}`
                            }
                          >
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {isFirstOfGame ? gameIndex : ""}
                            </TableCell>
                            <TableCell>
                              <div className="min-w-[200px]">
                                <div className="font-medium">
                                  {winner.gameName}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {winner.gameCode}
                                  {winnersInGame > 1
                                    ? ` · ${winnersInGame} winners`
                                    : ""}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>{winner.gameType}</TableCell>
                            <TableCell>
                              {winner.winnerUser ? (
                                <div className="min-w-[180px]">
                                  <div className="font-medium">
                                    {winner.winnerUser.fullName}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {winner.winnerUser.phoneNumber}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">
                                  Unknown
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {winner.cartelaNumber != null
                                ? `#${winner.cartelaNumber}`
                                : "-"}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              <div>{formatCurrency(winner.prizeAmount)}</div>
                              {winnersInGame > 1 && sessionPrize ? (
                                <div className="text-xs font-normal text-muted-foreground">
                                  of {formatCurrency(sessionPrize)}
                                </div>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              {formatDateTime(winner.finishedAt)}
                            </TableCell>
                            <TableCell className="text-right">
                              {isFirstOfGame ? (
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="outline"
                                  aria-label="Copy Telegram winner message"
                                  title="Copy Telegram winner message"
                                  onClick={() =>
                                    void copyGameForTelegram(gameWinners)
                                  }
                                >
                                  <Copy className="size-4" />
                                </Button>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        );
                      },
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function GamesReportLoading() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-24" />
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-44" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent>
              <div className="flex h-[280px] items-center justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
