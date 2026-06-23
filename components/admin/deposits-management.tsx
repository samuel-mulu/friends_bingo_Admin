"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";

import { approveDeposit, getAdminDeposits, rejectDeposit } from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { AdminDeposit } from "@/lib/api/types";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { ConfirmActionDialog } from "@/components/admin/confirm-action-dialog";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { AdminTableSkeleton } from "@/components/admin/admin-table-skeleton";
import {
  AdminEmptyState,
  AdminErrorState,
} from "@/components/admin/admin-table-state";
import { PageHeader } from "@/components/admin/page-header";
import { useAdminMutation } from "@/lib/admin/use-admin-mutation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const pageSize = 20;
const depositsQueryKey = (page: number) => ["admin", "deposits", page] as const;
const actionableStatuses = new Set(["PENDING"]);

function isAutoApprovedTelebirr(deposit: AdminDeposit): boolean {
  return (
    deposit.provider === "TELEBIRR" &&
    deposit.status === "APPROVED" &&
    deposit.verifiedData?.verificationSource !== "Manual admin approval"
  );
}

function showReviewActions(deposit: AdminDeposit): boolean {
  if (isAutoApprovedTelebirr(deposit)) {
    return false;
  }

  return actionableStatuses.has(deposit.status);
}

export function DepositsManagement() {
  const [page, setPage] = useState(1);
  const [approveTarget, setApproveTarget] = useState<AdminDeposit | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminDeposit | null>(null);

  const depositsQuery = useQuery({
    queryKey: depositsQueryKey(page),
    queryFn: () => getAdminDeposits(page, pageSize),
  });

  const approveMutation = useAdminMutation({
    mutationFn: (depositId: string) => approveDeposit(depositId),
    successMessage: "Deposit approved.",
    errorMessage: "The deposit could not be approved.",
    invalidateQueryKeys: [["admin", "deposits"]],
    onSuccess: () => {
      setApproveTarget(null);
    },
  });

  const rejectMutation = useAdminMutation({
    mutationFn: ({
      depositId,
      rejectionReason,
    }: {
      depositId: string;
      rejectionReason: string;
    }) => rejectDeposit(depositId, rejectionReason),
    successMessage: "Deposit rejected.",
    errorMessage: "The deposit could not be rejected.",
    invalidateQueryKeys: [["admin", "deposits"]],
    onSuccess: () => {
      setRejectTarget(null);
    },
  });

  const summary = useMemo(() => {
    const items = depositsQuery.data?.items ?? [];
    const pendingReview = items.filter((deposit) =>
      showReviewActions(deposit),
    ).length;

    return { pendingReview };
  }, [depositsQuery.data?.items]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deposits"
        description="View deposit history, open Telebirr receipts, and manually resolve rare pending deposits when Verify.ET verification did not finish."
      />

      <Card>
        <CardHeader className="gap-3 border-b border-border/60">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle>Deposit history</CardTitle>
              <CardDescription>
                Deposits are verified automatically through Verify.ET. Manual
                approve or reject is only for exceptional pending disputes.
              </CardDescription>
            </div>
            <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
              <div className="font-medium text-foreground">
                {summary.pendingReview.toLocaleString()} awaiting action
              </div>
              <div className="text-muted-foreground">Pending only</div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-0 pt-0">
          {depositsQuery.isLoading ? (
            <AdminTableSkeleton columns={10} />
          ) : depositsQuery.isError ? (
            <AdminErrorState
              title="Could not load deposits"
              description={getApiErrorMessage(
                depositsQuery.error,
                "Please try refreshing the deposit queue.",
              )}
              onRetry={() => depositsQuery.refetch()}
            />
          ) : !depositsQuery.data || depositsQuery.data.items.length === 0 ? (
            <AdminEmptyState
              title="No deposits yet"
              description="New deposit requests will appear here as players submit them."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Wallet Tx</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Verified</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {depositsQuery.data.items.map((deposit) => {
                    const canReview = showReviewActions(deposit);

                    return (
                      <TableRow key={deposit.id}>
                        <TableCell>
                          <div className="min-w-[180px]">
                            <div className="font-medium">{deposit.user.fullName}</div>
                            <div className="text-xs text-muted-foreground">
                              {deposit.user.phoneNumber}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{deposit.provider}</TableCell>
                        <TableCell>
                          <span className="font-mono text-xs text-muted-foreground">
                            {deposit.transactionRef}
                          </span>
                        </TableCell>
                        <TableCell>
                          {deposit.receiptUrl ? (
                            <a
                              href={deposit.receiptUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary underline-offset-4 hover:underline"
                            >
                              View receipt
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {deposit.walletTransactionId ? (
                            <span className="font-mono text-xs text-muted-foreground">
                              {deposit.walletTransactionId}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <AdminStatusBadge status={deposit.status} />
                          {deposit.rejectionReason ? (
                            <div className="mt-1 max-w-[220px] text-xs text-muted-foreground">
                              {deposit.rejectionReason}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {deposit.verifiedAmount ? (
                            <div>
                              <div className="font-medium">
                                {formatCurrency(deposit.verifiedAmount)}
                              </div>
                              {deposit.verifiedReceiverName ? (
                                <div className="text-xs text-muted-foreground">
                                  {deposit.verifiedReceiverName}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(deposit.amount)}
                        </TableCell>
                        <TableCell>{formatDateTime(deposit.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          {canReview ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setApproveTarget(deposit)}
                              >
                                <CheckCircle2 className="size-4" />
                                Approve
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setRejectTarget(deposit)}
                              >
                                <XCircle className="size-4" />
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <AdminPagination
                pagination={depositsQuery.data.pagination}
                onPageChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmActionDialog
        open={Boolean(approveTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setApproveTarget(null);
          }
        }}
        title="Approve deposit"
        description={
          approveTarget
            ? `Credit ${formatCurrency(approveTarget.amount)} for ${approveTarget.user.fullName}. This will approve ${approveTarget.transactionRef} and push the wallet update immediately.`
            : "Approve this deposit."
        }
        confirmLabel="Approve deposit"
        onConfirm={() => {
          if (!approveTarget) {
            return;
          }

          approveMutation.mutate(approveTarget.id);
        }}
        isPending={approveMutation.isPending}
      />

      <ConfirmActionDialog
        open={Boolean(rejectTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
          }
        }}
        title="Reject deposit"
        description={
          rejectTarget
            ? `Reject ${rejectTarget.transactionRef} for ${rejectTarget.user.fullName}. A clear rejection reason will be stored for finance follow-up.`
            : "Reject this deposit."
        }
        confirmLabel="Reject deposit"
        confirmVariant="destructive"
        field={{
          label: "Rejection reason",
          placeholder: "Explain why this deposit is being rejected",
          required: true,
        }}
        onConfirm={(value) => {
          if (!rejectTarget || !value?.trim()) {
            return;
          }

          rejectMutation.mutate({
            depositId: rejectTarget.id,
            rejectionReason: value.trim(),
          });
        }}
        isPending={rejectMutation.isPending}
      />
    </div>
  );
}
