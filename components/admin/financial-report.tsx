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
  Coins,
  Loader2,
  MinusCircle,
  Plus,
  ReceiptText,
  Scale,
  Trophy,
} from "lucide-react";

import { createAdminExpense, getFinancialReport } from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useAdminMutation } from "@/lib/admin/use-admin-mutation";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { AdminEmptyState } from "@/components/admin/admin-table-state";
import { LoadingButton } from "@/components/admin/loading-button";
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

const financialReportQueryKey = (from: string, to: string) =>
  ["admin", "reports", "financial", from, to] as const;

export function FinancialReportView() {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(getDateDaysAgo(6));
  const [to, setTo] = useState(getTodayDate());
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseReason, setExpenseReason] = useState("");
  const [expenseNote, setExpenseNote] = useState("");
  const [expenseDate, setExpenseDate] = useState(getTodayDate());
  const [expenseFormError, setExpenseFormError] = useState<string | null>(null);

  const financialQuery = useQuery({
    queryKey: financialReportQueryKey(from, to),
    queryFn: () =>
      getFinancialReport({
        from: from || undefined,
        to: to || undefined,
      }),
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
      setExpenseDate(getTodayDate());
      setExpenseFormError(null);
      void queryClient.invalidateQueries({
        queryKey: financialReportQueryKey(from, to),
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
      <PageHeader
        title="Financial Reports"
        description="Track deposits, withdrawals, company fees from cartela registrations, operational expenses, and net profit for the selected date range."
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
              description={`${financialQuery.data.expenses.length.toLocaleString()} recorded expenses in this range`}
              icon={<MinusCircle className="size-5" />}
            />
            <ReportMetricCard
              title="Net Revenue"
              value={formatCurrency(financialQuery.data.netRevenue)}
              description="Game entry total minus prize payouts"
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
                <CardTitle>Expenses in range</CardTitle>
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
                        formatter={(value) => formatCurrency(String(value ?? 0))}
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
                    description="Company fees or expenses in the selected range will appear here."
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

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function getDateDaysAgo(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}
