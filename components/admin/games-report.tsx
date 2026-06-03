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
import { Gamepad2, Loader2, Target, Ticket, Trophy, Users } from "lucide-react";

import { getGamesReport } from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import {
  AdminEmptyState,
} from "@/components/admin/admin-table-state";
import { PageHeader } from "@/components/admin/page-header";
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
  const [from, setFrom] = useState(getDateDaysAgo(29));
  const [to, setTo] = useState(getTodayDate());

  const gamesQuery = useQuery({
    queryKey: gamesReportQueryKey(from, to),
    queryFn: () =>
      getGamesReport({
        from: from || undefined,
        to: to || undefined,
      }),
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Game Reports"
        description="Review game creation, completions, registration volume, prize totals, and winner outcomes across a selected reporting window."
      />

      <ReportDateRangeFilter
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        onReset={() => {
          setFrom(getDateDaysAgo(29));
          setTo(getTodayDate());
        }}
      />

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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <ReportMetricCard
              title="Games Created"
              value={gamesQuery.data.gamesCreated.toLocaleString()}
              description="Games set up during the selected range"
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
              description="Entry fee value across all registrations"
              icon={<Target className="size-5" />}
            />
            <ReportMetricCard
              title="Total Prize Amount"
              value={formatCurrency(gamesQuery.data.totalPrizeAmount)}
              description="Prize value configured for created games"
              icon={<Trophy className="size-5" />}
            />
            <ReportMetricCard
              title="Average Players Per Game"
              value={gamesQuery.data.averagePlayersPerGame.toFixed(2)}
              description="Registration average based on created games"
              icon={<Users className="size-5" />}
              emphasize
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
                  Entry fee volume compared with the total configured prize value
                  in the selected range.
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
                Finished games with recorded winners in the selected period.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pt-0">
              {gamesQuery.data.winners.length === 0 ? (
                <AdminEmptyState
                  title="No winners in this range"
                  description="Finished games with winners will appear here once the selected period includes completed results."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Game</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Winner</TableHead>
                      <TableHead>Cartela</TableHead>
                      <TableHead className="text-right">Prize</TableHead>
                      <TableHead>Finished</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gamesQuery.data.winners.map((winner) => (
                      <TableRow key={winner.winnerCartelaId ?? winner.gameId}>
                        <TableCell>
                          <div className="min-w-[200px]">
                            <div className="font-medium">{winner.gameName}</div>
                            <div className="text-xs text-muted-foreground">
                              {winner.gameCode}
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
                            <span className="text-muted-foreground">Unknown</span>
                          )}
                        </TableCell>
                        <TableCell>{winner.cartelaNumber ?? "-"}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(winner.prizeAmount)}
                        </TableCell>
                        <TableCell>{formatDateTime(winner.finishedAt)}</TableCell>
                      </TableRow>
                    ))}
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
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function getDateDaysAgo(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}
