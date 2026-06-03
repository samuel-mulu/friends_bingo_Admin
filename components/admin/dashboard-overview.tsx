"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Coins,
  Gamepad2,
  Loader2,
  Trophy,
  Users,
  WalletCards,
} from "lucide-react";

import { getOverviewReport } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";
import type { OverviewReport } from "@/lib/api/types";
import { formatCurrency } from "@/lib/formatters";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

const overviewQueryKey = ["admin", "reports", "overview"] as const;

export function DashboardOverview() {
  const overviewQuery = useQuery({
    queryKey: overviewQueryKey,
    queryFn: getOverviewReport,
  });

  if (overviewQuery.isLoading) {
    return <DashboardOverviewLoading />;
  }

  if (overviewQuery.isError) {
    return (
      <Card className="border-destructive/20 bg-destructive/5">
        <CardHeader>
          <CardTitle>Could not load dashboard</CardTitle>
          <CardDescription>
            {overviewQuery.error instanceof ApiError
              ? overviewQuery.error.message
              : "Something went wrong while loading the overview."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => overviewQuery.refetch()}>Try again</Button>
        </CardContent>
      </Card>
    );
  }

  if (!overviewQuery.data) {
    return null;
  }

  return <DashboardOverviewContent overview={overviewQuery.data} />;
}

function DashboardOverviewContent({ overview }: { overview: OverviewReport }) {
  const chartData = useMemo(
    () => [
      {
        label: "Deposits",
        value: Number(overview.depositsTodayTotal),
      },
      {
        label: "Withdrawals",
        value: Number(overview.withdrawalsTodayTotal),
      },
      {
        label: "Game Entry",
        value: Number(overview.gameEntryTodayTotal),
      },
      {
        label: "Prize Paid",
        value: Number(overview.prizePaidTodayTotal),
      },
      {
        label: "Net",
        value: Number(overview.netToday),
      },
    ],
    [overview],
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          title="Total Players"
          value={overview.totalPlayers.toLocaleString()}
          description={`${overview.activePlayers.toLocaleString()} active players`}
          icon={Users}
        />
        <MetricCard
          title="Active Games"
          value={overview.activeGames.toLocaleString()}
          description={`${overview.finishedGamesToday.toLocaleString()} finished today`}
          icon={Gamepad2}
        />
        <MetricCard
          title="Pending Deposits"
          value={overview.pendingDeposits.toLocaleString()}
          description="Needs finance review"
          icon={ArrowDownToLine}
        />
        <MetricCard
          title="Pending Withdrawals"
          value={overview.pendingWithdrawals.toLocaleString()}
          description="Awaiting approval or payout"
          icon={ArrowUpFromLine}
        />
        <MetricCard
          title="Net Today"
          value={formatCurrency(overview.netToday)}
          description="Game entry minus prizes"
          icon={Coins}
          emphasize
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
        <Card className="min-h-[360px]">
          <CardHeader>
            <CardTitle>Today&apos;s Money Flow</CardTitle>
            <CardDescription>
              Quick snapshot of today&apos;s deposits, withdrawals, entries,
              prizes, and net.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.18} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}`}
                />
                <Tooltip
                  formatter={(value) => formatCurrency(String(value ?? 0))}
                  cursor={{ fill: "rgba(13, 92, 99, 0.06)" }}
                />
                <Bar
                  dataKey="value"
                  radius={[12, 12, 0, 0]}
                  fill="var(--color-chart-2)"
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <MetricCard
            title="Deposits Today"
            value={formatCurrency(overview.depositsTodayTotal)}
            description="Approved deposits"
            icon={WalletCards}
          />
          <MetricCard
            title="Withdrawals Today"
            value={formatCurrency(overview.withdrawalsTodayTotal)}
            description="Paid withdrawals"
            icon={ArrowUpFromLine}
          />
          <MetricCard
            title="Game Entry Today"
            value={formatCurrency(overview.gameEntryTodayTotal)}
            description="Wallet debits for entries"
            icon={Activity}
          />
          <MetricCard
            title="Prize Paid Today"
            value={formatCurrency(overview.prizePaidTodayTotal)}
            description="Winner wallet credits"
            icon={Trophy}
          />
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  emphasize = false,
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  emphasize?: boolean;
}) {
  return (
    <Card className={emphasize ? "border-primary/20 bg-primary/5" : undefined}>
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardDescription>{title}</CardDescription>
            <CardTitle className="text-2xl">{value}</CardTitle>
          </div>
          <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="size-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function DashboardOverviewLoading() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Card key={index}>
            <CardHeader className="gap-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <div className="flex h-[280px] items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index}>
              <CardHeader>
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-7 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
