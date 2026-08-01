"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Building2,
  ChevronLeft,
  ChevronRight,
  Coins,
  CreditCard,
  Download,
  Loader2,
  MinusCircle,
  Plus,
  ReceiptText,
  Scale,
  Trophy,
  Wallet,
} from "lucide-react";

import { createAdminExpense, getFinancialReport } from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { FinancialSettlementAccountKey } from "@/lib/api/types";
import { useAdminMutation } from "@/lib/admin/use-admin-mutation";
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
import { exportFinancialReportPdf } from "@/lib/admin/export-financial-report-pdf";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { adminToast } from "@/lib/admin/admin-toast";
import { AdminEmptyState } from "@/components/admin/admin-table-state";
import { LoadingButton } from "@/components/admin/loading-button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const financialReportQueryKey = (
  from: string,
  to: string,
  settlementAccount: FinancialSettlementAccountKey,
) => ["admin", "reports", "financial", from, to, settlementAccount] as const;

export function FinancialReportView() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<FinancialPeriodMode>("daily");
  const [dayKey, setDayKey] = useState(getTodayDateKey);
  const [monthKey, setMonthKey] = useState(getCurrentMonthKey);
  const [rangeFrom, setRangeFrom] = useState(() =>
    shiftDayKey(getTodayDateKey(), -6),
  );
  const [rangeTo, setRangeTo] = useState(getTodayDateKey);
  const [settlementAccount, setSettlementAccount] =
    useState<FinancialSettlementAccountKey>("all");
  const [showSettlementPanel, setShowSettlementPanel] = useState(false);

  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseReason, setExpenseReason] = useState("");
  const [expenseNote, setExpenseNote] = useState("");
  const [expenseDate, setExpenseDate] = useState(getTodayDateKey);
  const [expenseFormError, setExpenseFormError] = useState<string | null>(null);
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

  const financialQuery = useQuery({
    queryKey: financialReportQueryKey(from, to, settlementAccount),
    queryFn: () =>
      getFinancialReport({
        from: from || undefined,
        to: to || undefined,
        settlementAccount,
      }),
    placeholderData: (previous) => previous,
  });

  const createExpense = useAdminMutation({
    mutationFn: createAdminExpense,
    successMessage: "Expense recorded.",
    errorMessage: "Could not record the expense.",
    invalidateQueryKeys: [],
    onSuccess: () => {
      setExpenseAmount("");
      setExpenseReason("");
      setExpenseNote("");
      setExpenseDate(getTodayDateKey());
      setExpenseFormError(null);
      void queryClient.invalidateQueries({
        queryKey: ["admin", "reports", "financial"],
      });
    },
    onError: (error) => {
      setExpenseFormError(
        getApiErrorMessage(error, "Could not record the expense."),
      );
    },
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
        companyFees: Number(day.companyFeeTotal),
        expenses: Number(day.expensesTotal),
        profitNet: Number(day.profitNet),
      })),
    [financialQuery.data?.dailyTotals],
  );

  const hasChartData = chartData.some(
    (day) =>
      day.deposits > 0 ||
      day.withdrawals > 0 ||
      day.gameEntries > 0 ||
      day.prizes > 0 ||
      day.net !== 0 ||
      day.companyFees > 0 ||
      day.expenses > 0,
  );

  const hasProfitChartData = chartData.some(
    (day) => day.companyFees > 0 || day.expenses > 0 || day.profitNet !== 0,
  );

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
    if (!financialQuery.data) {
      adminToast.error("Load the financial report before exporting.");
      return;
    }

    setIsExportingPdf(true);
    try {
      exportFinancialReportPdf({
        report: financialQuery.data,
        periodLabel,
        modeLabel,
        from,
        to,
        settlementAccount,
      });
      adminToast.success("Financial PDF downloaded.");
    } catch (error) {
      adminToast.error(
        getApiErrorMessage(error, "Could not generate the PDF report."),
      );
    } finally {
      setIsExportingPdf(false);
    }
  };

  const submitExpense = () => {
    const amount = expenseAmount.trim();
    const reason = expenseReason.trim();

    if (!amount || Number(amount) <= 0) {
      setExpenseFormError("Enter a valid expense amount.");
      return;
    }

    if (!reason) {
      setExpenseFormError("Reason is required for every expense.");
      return;
    }

    setExpenseFormError(null);
    createExpense.mutate({
      amount,
      reason,
      note: expenseNote.trim() || undefined,
      expenseDate: expenseDate || undefined,
    });
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
            setRangeFrom(shiftDayKey(getTodayDateKey(), -6));
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
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={showSettlementPanel ? "default" : "outline"}
            onClick={() => setShowSettlementPanel((open) => !open)}
          >
            <CreditCard className="size-4" />
            Settlement accounts
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!financialQuery.data || isExportingPdf}
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
        {settlementAccount !== "all" ? (
          <p className="text-sm text-muted-foreground">
            Deposits filtered · other metrics stay period-wide
          </p>
        ) : null}
      </div>

      {showSettlementPanel ? (
        <Card>
          <CardHeader>
            <CardTitle>Filter deposits by receiving account</CardTitle>
            <CardDescription>
              Telebirr and CBE accounts that receive player deposits. Selecting
              one filters deposit totals only.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={settlementAccount === "all" ? "default" : "outline"}
                onClick={() => setSettlementAccount("all")}
              >
                All accounts
              </Button>
              {(financialQuery.data?.settlementAccounts ?? []).map((account) => (
                <Button
                  key={account.key}
                  type="button"
                  size="sm"
                  variant={
                    settlementAccount === account.key ? "default" : "outline"
                  }
                  onClick={() => setSettlementAccount(account.key)}
                >
                  {account.provider} · {account.account}
                </Button>
              ))}
            </div>
            {financialQuery.data?.settlementBreakdown?.length ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {financialQuery.data.settlementBreakdown.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSettlementAccount(item.key)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-colors",
                      settlementAccount === item.key
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/40",
                    )}
                  >
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {item.label}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {item.account}
                    </p>
                    <p className="mt-2 text-base font-semibold">
                      {formatCurrency(item.depositsTotal)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.depositCount.toLocaleString()} deposits
                    </p>
                  </button>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

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
          <Card className="border-primary/20 bg-[linear-gradient(135deg,rgba(13,92,99,0.08)_0%,rgba(31,122,140,0.04)_100%)]">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                  <Wallet className="size-5" />
                </div>
                <div>
                  <CardTitle>Total player wallets</CardTitle>
                  <CardDescription>
                    Current balances held across all players (not limited by
                    date filter)
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Available
                </p>
                <p className="mt-1 text-xl font-semibold">
                  {formatCurrency(financialQuery.data.totalWalletsBalance)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Locked
                </p>
                <p className="mt-1 text-xl font-semibold">
                  {formatCurrency(financialQuery.data.totalWalletsLocked)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Liability total
                </p>
                <p className="mt-1 text-2xl font-semibold text-primary">
                  {formatCurrency(financialQuery.data.totalWalletsLiability)}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <ReportMetricCard
              title="Deposits Total"
              value={formatCurrency(financialQuery.data.depositsTotal)}
              description={
                settlementAccount === "all"
                  ? "Approved deposits in the selected period"
                  : "Filtered by selected settlement account"
              }
              icon={<ArrowDownToLine className="size-5" />}
            />
            <ReportMetricCard
              title="Withdrawals Total"
              value={formatCurrency(financialQuery.data.withdrawalsTotal)}
              description="Paid withdrawals in the selected period"
              icon={<ArrowUpFromLine className="size-5" />}
            />
            <ReportMetricCard
              title="Company Fee Total"
              value={formatCurrency(financialQuery.data.companyFeeTotal)}
              description="Real-money company fees from paid registrations"
              icon={<Building2 className="size-5" />}
            />
            <ReportMetricCard
              title="Bonus Entry Value"
              value={formatCurrency(financialQuery.data.bonusEntryValueTotal)}
              description={`${financialQuery.data.bonusCartelasUsed.toLocaleString()} bonus cartelas used`}
              icon={<Coins className="size-5" />}
            />
            <ReportMetricCard
              title="Bonus Company Fee Value"
              value={formatCurrency(financialQuery.data.bonusCompanyFeeTotal)}
              description="Company fee value covered by bonus cartelas"
              icon={<Building2 className="size-5" />}
            />
            <ReportMetricCard
              title="Game Entry Total"
              value={formatCurrency(financialQuery.data.gameEntryTotal)}
              description="Real-money wallet debits for game registrations"
              icon={<ReceiptText className="size-5" />}
            />
            <ReportMetricCard
              title="Prize Paid Total"
              value={formatCurrency(financialQuery.data.prizePaidTotal)}
              description="Prize credits paid to winners"
              icon={<Trophy className="size-5" />}
            />
            <ReportMetricCard
              title="Expenses Total"
              value={formatCurrency(financialQuery.data.expensesTotal)}
              description={`${financialQuery.data.expenses.length.toLocaleString()} recorded expenses in this period`}
              icon={<MinusCircle className="size-5" />}
            />
            <ReportMetricCard
              title="Net Revenue"
              value={formatCurrency(financialQuery.data.netRevenue)}
              description="All game entries (money + bonus) minus prize payouts"
              icon={<Coins className="size-5" />}
            />
            <ReportMetricCard
              title="Profit Net"
              value={formatCurrency(financialQuery.data.profitNet)}
              description="Company fee total minus expenses"
              icon={<Scale className="size-5" />}
              emphasize
            />
            <ReportMetricCard
              title="Transaction Count"
              value={financialQuery.data.transactionCount.toLocaleString()}
              description="Combined deposit, withdrawal, entry, and prize events"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Record expense</CardTitle>
                <CardDescription>
                  Add operational costs for this report. Reason is required;
                  note is optional.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="expense-amount">Amount (ETB)</Label>
                    <Input
                      id="expense-amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={expenseAmount}
                      onChange={(event) => setExpenseAmount(event.target.value)}
                      placeholder="150.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expense-date">Expense date</Label>
                    <Input
                      id="expense-date"
                      type="date"
                      value={expenseDate}
                      onChange={(event) => setExpenseDate(event.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expense-reason">Reason *</Label>
                  <Input
                    id="expense-reason"
                    value={expenseReason}
                    onChange={(event) => setExpenseReason(event.target.value)}
                    placeholder="Internet bill, staff payment, supplies..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expense-note">Note</Label>
                  <Input
                    id="expense-note"
                    value={expenseNote}
                    onChange={(event) => setExpenseNote(event.target.value)}
                    placeholder="Optional extra detail"
                  />
                </div>
                {expenseFormError ? (
                  <p className="text-sm text-destructive">{expenseFormError}</p>
                ) : null}
                <LoadingButton
                  onClick={submitExpense}
                  isLoading={createExpense.isPending}
                  loadingLabel="Saving..."
                  className="w-full sm:w-auto"
                >
                  <Plus className="mr-2 size-4" />
                  Add expense
                </LoadingButton>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Expenses in period</CardTitle>
                <CardDescription>
                  All recorded expenses between {from || "start"} and{" "}
                  {to || "end"}.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                {financialQuery.data.expenses.length === 0 ? (
                  <div className="px-6">
                    <AdminEmptyState
                      title="No expenses recorded"
                      description="Add an expense above to start tracking operational costs in this report."
                    />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Note</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {financialQuery.data.expenses.map((expense) => (
                        <TableRow key={expense.id}>
                          <TableCell>
                            {formatDateTime(expense.expenseDate)}
                          </TableCell>
                          <TableCell className="font-medium">
                            {expense.reason}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {expense.note || "—"}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(expense.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
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
                        formatter={(value) =>
                          formatCurrency(String(value ?? 0))
                        }
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
                    title="No financial activity in this period"
                    description="Move to another day or month to inspect a busier window."
                  />
                )}
              </CardContent>
            </Card>

            <Card className="min-h-[380px]">
              <CardHeader>
                <CardTitle>Profit net trend</CardTitle>
                <CardDescription>
                  Daily company fee income compared with recorded expenses.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                {hasProfitChartData ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.18} />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} />
                      <Tooltip
                        formatter={(value) =>
                          formatCurrency(String(value ?? 0))
                        }
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="companyFees"
                        stroke="var(--color-chart-1)"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="expenses"
                        stroke="var(--color-chart-4)"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="profitNet"
                        stroke="var(--color-chart-2)"
                        strokeWidth={3}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <AdminEmptyState
                    title="No profit trend yet"
                    description="Company fees or expenses in the selected period will appear here."
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
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 9 }).map((_, index) => (
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
