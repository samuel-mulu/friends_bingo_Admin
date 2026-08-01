"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Loader2, MessageSquare } from "lucide-react";

import { getHouseChampions } from "@/lib/api/admin";
import { adminToast } from "@/lib/admin/admin-toast";
import { formatTelegramHouseChampionsMessage } from "@/lib/admin/format-telegram-house-champions-message";
import { getApiErrorMessage } from "@/lib/api/errors";
import type {
  HouseChampionsEntry,
  HouseChampionsQueryParams,
  HouseChampionsResponse,
  LeaderboardPeriod,
} from "@/lib/api/types";
import { formatDateTime } from "@/lib/formatters";
import {
  AdminEmptyState,
  AdminErrorState,
} from "@/components/admin/admin-table-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const periodOptions: Array<{ value: LeaderboardPeriod; label: string }> = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "last_week", label: "Last week" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "all_time", label: "All time" },
  { value: "custom", label: "Custom date range" },
];

function periodLabelFromResponse(data: HouseChampionsResponse | undefined) {
  if (!data) {
    return null;
  }

  if (data.labelStart && data.labelEnd && data.labelStart !== data.labelEnd) {
    return `${data.labelStart} – ${data.labelEnd}`;
  }

  if (data.labelStart) {
    return data.labelStart;
  }

  return periodOptions.find((option) => option.value === data.period)?.label ?? "All time";
}

function rankBadge(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return String(rank);
}

function PodiumCard({
  entry,
  emphasis,
}: {
  entry: HouseChampionsEntry;
  emphasis?: "gold" | "silver" | "bronze";
}) {
  const accent =
    emphasis === "gold"
      ? "border-amber-300 bg-amber-50"
      : emphasis === "silver"
        ? "border-slate-300 bg-slate-50"
        : emphasis === "bronze"
          ? "border-orange-300 bg-orange-50"
          : "border-border bg-muted/30";

  return (
    <div
      className={`flex flex-col items-center rounded-2xl border px-4 py-5 text-center shadow-sm ${accent}`}
    >
      <div className="text-3xl font-bold leading-none">{rankBadge(entry.rank)}</div>
      <div className="mt-3 text-base font-semibold text-foreground">
        {entry.fullName ?? entry.displayName}
      </div>
      <div className="mt-1 text-sm text-muted-foreground">
        {entry.phoneNumber ?? "—"}
      </div>
      <div className="mt-4 rounded-full bg-white/80 px-3 py-1 text-sm font-semibold text-foreground">
        {entry.cartelaWins} wins
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {entry.gamesWon} games
      </div>
    </div>
  );
}

function TopThreePodium({ entries }: { entries: HouseChampionsEntry[] }) {
  const first = entries.find((entry) => entry.rank === 1);
  const second = entries.find((entry) => entry.rank === 2);
  const third = entries.find((entry) => entry.rank === 3);

  if (!first) {
    return null;
  }

  return (
    <div className="grid gap-3 md:grid-cols-3 md:items-end">
      <div className="md:order-1 md:pt-6">
        {second ? <PodiumCard entry={second} emphasis="silver" /> : <div />}
      </div>
      <div className="md:order-2">
        <PodiumCard entry={first} emphasis="gold" />
      </div>
      <div className="md:order-3 md:pt-8">
        {third ? <PodiumCard entry={third} emphasis="bronze" /> : <div />}
      </div>
    </div>
  );
}

function RankedListItem({ entry }: { entry: HouseChampionsEntry }) {
  const isTopThree = entry.rank <= 3;

  return (
    <div className="flex items-center gap-4 rounded-xl border bg-card px-4 py-3">
      <div
        className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          isTopThree
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {entry.rank}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">
          {entry.fullName ?? entry.displayName}
        </div>
        <div className="text-sm text-muted-foreground">
          {entry.phoneNumber ?? "No phone"}
        </div>
      </div>
      <div className="text-right">
        <div className="font-semibold">{entry.cartelaWins}</div>
        <div className="text-xs text-muted-foreground">cartela wins</div>
      </div>
      <div className="hidden text-right sm:block">
        <div className="font-medium">{entry.gamesWon}</div>
        <div className="text-xs text-muted-foreground">games</div>
      </div>
    </div>
  );
}

export function HouseChampionsManagement() {
  const [period, setPeriod] = useState<LeaderboardPeriod>("week");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [isCopying, setIsCopying] = useState<LeaderboardPeriod | "current" | null>(
    null,
  );

  const queryParams = useMemo<HouseChampionsQueryParams>(() => {
    const params: HouseChampionsQueryParams = {
      period,
      limit: 15,
    };

    if (period === "custom") {
      if (from) {
        params.from = new Date(`${from}T00:00:00+03:00`).toISOString();
      }
      if (to) {
        const end = new Date(`${to}T00:00:00+03:00`);
        end.setDate(end.getDate() + 1);
        params.to = end.toISOString();
      }
    }

    return params;
  }, [from, period, to]);

  const championsQuery = useQuery({
    queryKey: ["admin", "house-champions", queryParams],
    queryFn: () => getHouseChampions(queryParams),
    enabled: period !== "custom" || Boolean(from && to),
  });

  const copyTelegramPost = useCallback(
    async (target: LeaderboardPeriod | "current") => {
      setIsCopying(target);
      try {
        const response =
          target === "current"
            ? championsQuery.data
            : await getHouseChampions({ period: target, limit: 15 });

        if (!response?.entries.length) {
          adminToast.error("No champions to copy for that period.");
          return;
        }

        const message = formatTelegramHouseChampionsMessage(response);
        await navigator.clipboard.writeText(message);
        adminToast.success("Telegram post copied to clipboard.");
      } catch {
        adminToast.error("Could not copy Telegram post.");
      } finally {
        setIsCopying(null);
      }
    },
    [championsQuery.data],
  );

  const periodLabel = periodLabelFromResponse(championsQuery.data);
  const entries = championsQuery.data?.entries ?? [];
  const topThree = entries.filter((entry) => entry.rank <= 3);
  const rest = entries.filter((entry) => entry.rank > 3);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle>House Champions</CardTitle>
              <CardDescription>
                See who won the most cartelas. Pick a time period from the
                dropdown, then copy a ready-made Telegram post for today or this
                week.
              </CardDescription>
            </div>
            {periodLabel ? <Badge variant="secondary">{periodLabel}</Badge> : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_1fr]">
            <div className="space-y-2">
              <Label htmlFor="house-champions-period">Time period</Label>
              <Select
                value={period}
                onValueChange={(value) => setPeriod(value as LeaderboardPeriod)}
              >
                <SelectTrigger id="house-champions-period">
                  <SelectValue placeholder="Choose a period" />
                </SelectTrigger>
                <SelectContent>
                  {periodOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Telegram post</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={Boolean(isCopying)}
                  onClick={() => void copyTelegramPost("today")}
                >
                  {isCopying === "today" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                  Copy — Today
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={Boolean(isCopying)}
                  onClick={() => void copyTelegramPost("week")}
                >
                  {isCopying === "week" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                  Copy — This week
                </Button>
                <Button
                  type="button"
                  disabled={Boolean(isCopying) || !entries.length}
                  onClick={() => void copyTelegramPost("current")}
                >
                  {isCopying === "current" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <MessageSquare className="size-4" />
                  )}
                  Copy current view
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={championsQuery.isFetching}
                  onClick={() => championsQuery.refetch()}
                >
                  {championsQuery.isFetching ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  Refresh
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Paste into Telegram. Player phones are partially hidden for
                privacy.
              </p>
            </div>
          </div>

          {period === "custom" ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="house-champions-from">From</Label>
                <Input
                  id="house-champions-from"
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="house-champions-to">To</Label>
                <Input
                  id="house-champions-to"
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
              </div>
            </div>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-6">
          {period === "custom" && (!from || !to) ? (
            <AdminEmptyState
              title="Choose start and end dates"
              description="Pick both dates above to load champions for a custom range."
            />
          ) : championsQuery.isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 size-5 animate-spin" />
              Loading champions...
            </div>
          ) : championsQuery.isError ? (
            <AdminErrorState
              title="Could not load House Champions"
              description={getApiErrorMessage(championsQuery.error)}
              onRetry={() => championsQuery.refetch()}
            />
          ) : !entries.length ? (
            <AdminEmptyState
              title="No champions yet"
              description="No winning cartelas were recorded for this period."
            />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Ranked by winning cartelas, not prize amount. Updated{" "}
                {formatDateTime(championsQuery.data!.updatedAt)}.
              </p>

              {topThree.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Top 3
                  </h3>
                  <TopThreePodium entries={topThree} />
                </div>
              ) : null}

              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {rest.length > 0 ? "Places 4–15" : "Ranking"}
                </h3>
                <div className="space-y-2">
                  {(rest.length > 0 ? rest : entries).map((entry) => (
                    <RankedListItem key={entry.userId} entry={entry} />
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
