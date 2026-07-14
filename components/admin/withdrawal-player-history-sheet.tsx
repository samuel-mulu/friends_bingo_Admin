"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, History, Wallet } from "lucide-react";

import { getAdminUserFinancialHistory } from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { AdminWithdrawal } from "@/lib/api/types";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
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

export function WithdrawalPlayerHistorySheet({
  withdrawal,
  open,
  onOpenChange,
}: {
  withdrawal: AdminWithdrawal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const userId = withdrawal?.userId ?? null;

  const historyQuery = useQuery({
    queryKey: ["admin", "users", userId, "financial-history"],
    queryFn: () => getAdminUserFinancialHistory(userId as string),
    enabled: open && Boolean(userId),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-2xl"
      >
        <SheetHeader>
          <SheetTitle>Player financial history</SheetTitle>
          <SheetDescription>
            Security check before payout
            {withdrawal
              ? ` · reviewing ${formatCurrency(withdrawal.amount)} ${withdrawal.provider}`
              : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4 px-1 pb-6">
          {historyQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading history…</p>
          ) : historyQuery.isError ? (
            <AdminErrorState
              title="Could not load history"
              description={getApiErrorMessage(
                historyQuery.error,
                "Try again in a moment.",
              )}
              onRetry={() => historyQuery.refetch()}
            />
          ) : !historyQuery.data ? (
            <AdminEmptyState
              title="No history found"
              description="This player has no financial records yet."
            />
          ) : (
            <>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>{historyQuery.data.user.fullName}</CardTitle>
                  <CardDescription>
                    {historyQuery.data.user.phoneNumber}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <DetailItem
                    label="Status"
                    value={
                      <AdminStatusBadge status={historyQuery.data.user.status} />
                    }
                  />
                  <DetailItem
                    label="Joined"
                    value={formatDateTime(historyQuery.data.user.createdAt)}
                  />
                  <DetailItem
                    label="Available"
                    value={
                      <span className="font-semibold">
                        {formatCurrency(historyQuery.data.wallet?.balance ?? "0")}
                      </span>
                    }
                  />
                  <DetailItem
                    label="Locked"
                    value={
                      <span className="font-semibold">
                        {formatCurrency(
                          historyQuery.data.wallet?.lockedBalance ?? "0",
                        )}
                      </span>
                    }
                  />
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Wallet className="size-4" />
                    </div>
                    <div>
                      <CardTitle>Money flow summary</CardTitle>
                      <CardDescription>
                        How this balance was built
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <DetailItem
                    label="Approved deposits"
                    value={`${formatCurrency(historyQuery.data.summary.totalDeposited)} · ${historyQuery.data.summary.approvedDepositCount}`}
                  />
                  <DetailItem
                    label="Prize wins"
                    value={`${formatCurrency(historyQuery.data.summary.totalPrizeWon)} · ${historyQuery.data.summary.prizeWinCount}`}
                  />
                  <DetailItem
                    label="Game entries spent"
                    value={`${formatCurrency(historyQuery.data.summary.totalGameEntry)} · ${historyQuery.data.summary.gameEntryCount}`}
                  />
                  <DetailItem
                    label="Paid withdrawals"
                    value={`${formatCurrency(historyQuery.data.summary.totalWithdrawn)} · ${historyQuery.data.summary.paidWithdrawalCount}`}
                  />
                  <DetailItem
                    label="Pending withdrawals"
                    value={`${formatCurrency(historyQuery.data.summary.pendingWithdrawalTotal)} · ${historyQuery.data.summary.pendingWithdrawalCount}`}
                  />
                </CardContent>
              </Card>

              <HistoryTableCard
                title="Deposits"
                description="Recent deposit attempts and approvals"
                empty="No deposits yet"
                headers={["Provider", "Amount", "Status", "Ref", "When"]}
                rows={historyQuery.data.deposits.map((deposit) => [
                  deposit.provider,
                  formatCurrency(deposit.amount),
                  <AdminStatusBadge key="s" status={deposit.status} />,
                  deposit.receiptUrl ? (
                    <a
                      key="r"
                      href={deposit.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Receipt
                      <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    <span key="r" className="text-xs text-muted-foreground">
                      {deposit.transactionRef}
                    </span>
                  ),
                  formatDateTime(deposit.createdAt),
                ])}
              />

              <HistoryTableCard
                title="Withdrawals"
                description="Previous cash-out requests"
                empty="No withdrawals yet"
                headers={["Provider", "Amount", "Status", "Receiver", "When"]}
                rows={historyQuery.data.withdrawals.map((item) => [
                  item.provider,
                  formatCurrency(item.amount),
                  <AdminStatusBadge key="s" status={item.status} />,
                  item.receiverPhone || item.receiverAccount || "-",
                  formatDateTime(item.createdAt),
                ])}
              />

              <HistoryTableCard
                title="Wallet ledger"
                description="All balance movements"
                empty="No wallet transactions yet"
                headers={["Type", "Amount", "Balance after", "Note", "When"]}
                rows={historyQuery.data.transactions.map((tx) => [
                  <Badge key="t" variant="outline" className="font-mono text-[11px]">
                    {tx.type}
                  </Badge>,
                  formatCurrency(tx.amount),
                  formatCurrency(tx.balanceAfter),
                  <span key="d" className="max-w-[140px] truncate text-xs text-muted-foreground">
                    {tx.description || tx.referenceType || "-"}
                  </span>,
                  formatDateTime(tx.createdAt),
                ])}
              />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function WithdrawalHistoryButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      <History className="size-4" />
      History
    </Button>
  );
}

function HistoryTableCard({
  title,
  description,
  empty,
  headers,
  rows,
}: {
  title: string;
  description: string;
  empty: string;
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {headers.map((header) => (
                    <TableHead key={header}>{header}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((cells, index) => (
                  <TableRow key={index}>
                    {cells.map((cell, cellIndex) => (
                      <TableCell key={cellIndex}>{cell}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
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
