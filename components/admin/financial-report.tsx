"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Coins,
  Loader2,
  ReceiptText,
  Trophy,
} from "lucide-react";

import { getFinancialReport } from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import { formatCurrency } from "@/lib/formatters";
import { AdminEmptyState } from "@/components/admin/admin-table-state";
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

const financialReportQueryKey = (from: string, to: string) =>
  ["admin", "reports", "financial", from, to] as const;

export function FinancialReportView() {
  const [from, setFrom] = useState(getDateDaysAgo(6));
  const [to, setTo] = useState(getTodayDate());

  const financialQuery = useQuery({
    queryKey: financialReportQueryKey(from, to),
    queryFn: () =>
      getFinancialReport({
        from: from || undefined,
        to: to || undefined,
      }),
  });

  const chartData = useMemo(
    () =>
      (financialQuery.data?.dailyTotals ?? []).map((day) => ({
        date: day.date,
        deposits: Number(day.depositsTotal),
        withdrawals: Number(day.withdrawalsTotal),
        gameEntries: Number(day.gameEntryTotal),
        prizes: Number(day.prizePaidTotal),
        net: Number(day.netRevenue),
      })),
    [financialQuery.data?.dailyTotals],
  );

  const hasChartData = chartData.some(
    (day) =>
      day.deposits > 0 ||
      day.withdrawals > 0 ||
      day.gameEntries > 0 ||
      day.prizes > 0 ||
      day.net !== 0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Reports"
        description="Track deposits, withdrawals, game entry fees, prize payouts, and net revenue across a selected reporting window."
      />

      <ReportDateRangeFilter
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        onReset={() => {
          setFrom(getDateDaysAgo(6));
          setTo(getTodayDate());
        }}
      />

      {financialQuery.isLoading ? (
        <FinancialReportLoading />
      ) : financialQuery.isError ? (
        <Card className="border-destructive/20 bg-destructive/5">
          <CardHeader>
            <CardTitle>Could not load financial report</CardTitle>
            <CardDescription>
              {getApiErrorMessage(
                financialQuery.error,
                "Something went wrong while loading the financial report.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => financialQuery.refetch()}>Try again</Button>
          </CardContent>
        </Card>
      ) : !financialQuery.data ? null : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <ReportMetricCard
              title="Deposits Total"
              value={formatCurrency(financialQuery.data.depositsTotal)}
              description="Approved deposits in the selected range"
              icon={<ArrowDownToLine className="size-5" />}
            />
            <ReportMetricCard
              title="Withdrawals Total"
              value={formatCurrency(financialQuery.data.withdrawalsTotal)}
              description="Paid withdrawals in the selected range"
              icon={<ArrowUpFromLine className="size-5" />}
            />
            <ReportMetricCard
              title="Game Entry Total"
              value={formatCurrency(financialQuery.data.gameEntryTotal)}
              description="Wallet debits for game registrations"
              icon={<ReceiptText className="size-5" />}
            />
            <ReportMetricCard
              title="Prize Paid Total"
              value={formatCurrency(financialQuery.data.prizePaidTotal)}
              description="Prize credits paid to winners"
              icon={<Trophy className="size-5" />}
            />
            <ReportMetricCard
              title="Net Revenue"
              value={formatCurrency(financialQuery.data.netRevenue)}
              description="Game entry total minus prize payouts"
              icon={<Coins className="size-5" />}
              emphasize
            />
            <ReportMetricCard
              title="Transaction Count"
              value={financialQuery.data.transactionCount.toLocaleString()}
              description="Combined deposit, withdrawal, entry, and prize events"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.25fr_0.95fr]">
            <Card className="min-h-[380px]">
              <CardHeader>
                <CardTitle>Daily money flow</CardTitle>
                <CardDescription>
                  Daily grouped totals across deposits, withdrawals, game
                  entries, and prize payouts.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                {hasChartData ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.18} />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} />
                      <Tooltip
                        formatter={(value) => formatCurrency(String(value ?? 0))}
                      />
                      <Legend />
                      <Bar
                        dataKey="deposits"
                        fill="var(--color-chart-1)"
                        radius={[8, 8, 0, 0]}
                      />
                      <Bar
                        dataKey="withdrawals"
                        fill="var(--color-chart-3)"
                        radius={[8, 8, 0, 0]}
                      />
                      <Bar
                        dataKey="gameEntries"
                        fill="var(--color-chart-2)"
                        radius={[8, 8, 0, 0]}
                      />
                      <Bar
                        dataKey="prizes"
                        fill="var(--color-chart-4)"
                        radius={[8, 8, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <AdminEmptyState
                    title="No financial activity in this range"
                    description="Adjust the date filter to inspect a busier reporting window."
                  />
                )}
              </CardContent>
            </Card>

            <Card className="min-h-[380px]">
              <CardHeader>
                <CardTitle>Net revenue trend</CardTitle>
                <CardDescription>
                  Daily net revenue highlights how entry fees compare with prize
                  payouts over time.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                {hasChartData ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.18} />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} />
                      <Tooltip
                        formatter={(value) => formatCurrency(String(value ?? 0))}
                      />
                      <Line
                        type="monotone"
                        dataKey="net"
                        stroke="var(--color-chart-2)"
                        strokeWidth={3}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <AdminEmptyState
                    title="No net revenue trend yet"
                    description="Once the selected period has entries or prizes, the trend line will appear here."
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function FinancialReportLoading() {
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
      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.95fr]">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent>
              <div className="flex h-[300px] items-center justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
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
