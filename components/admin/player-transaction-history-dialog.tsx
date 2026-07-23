"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getAdminUserWalletTransactions } from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import {
  AdminEmptyState,
  AdminErrorState,
} from "@/components/admin/admin-table-state";
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

const pageSize = 20;

export function PlayerTransactionHistoryDialog({
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

  const transactionsQuery = useQuery({
    queryKey: ["admin", "users", userId, "wallet-transactions", page],
    queryFn: () =>
      getAdminUserWalletTransactions(userId as string, page, pageSize),
    enabled: open && Boolean(userId),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setPage(1);
        }
        onOpenChange(next);
      }}
    >
        <DialogContent
          className="flex max-h-[92vh] w-[min(96vw,64rem)] max-w-[min(96vw,64rem)]! flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,64rem)]!"
          showCloseButton
        >
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <DialogTitle>Transaction history</DialogTitle>
          <DialogDescription>
            Wallet ledger
            {playerName ? ` for ${playerName}` : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {transactionsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading transactions…
            </p>
          ) : transactionsQuery.isError ? (
            <AdminErrorState
              title="Could not load transactions"
              description={getApiErrorMessage(
                transactionsQuery.error,
                "Try again in a moment.",
              )}
              onRetry={() => transactionsQuery.refetch()}
            />
          ) : !transactionsQuery.data?.items.length ? (
            <AdminEmptyState
              title="No transactions"
              description="This player has no wallet ledger entries yet."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Balance after</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactionsQuery.data.items.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell>{formatDateTime(tx.createdAt)}</TableCell>
                      <TableCell>
                        <AdminStatusBadge status={tx.type} />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(tx.amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(tx.balanceAfter)}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground">
                        {tx.description ||
                          (tx.referenceType
                            ? `${tx.referenceType}${
                                tx.referenceId
                                  ? ` · ${tx.referenceId.slice(0, 8)}`
                                  : ""
                              }`
                            : "—")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <AdminPagination
                pagination={transactionsQuery.data.pagination}
                onPageChange={setPage}
              />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
