"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Send, XCircle } from "lucide-react";

import {
  approveWithdrawal,
  getAdminWithdrawals,
  markWithdrawalPaid,
  rejectWithdrawal,
} from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { AdminWithdrawal } from "@/lib/api/types";
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
const withdrawalsQueryKey = (page: number) =>
  ["admin", "withdrawals", page] as const;
const reversibleStatuses = new Set(["PENDING", "APPROVED"]);

export function WithdrawalsManagement() {
  const [page, setPage] = useState(1);
  const [approveTarget, setApproveTarget] = useState<AdminWithdrawal | null>(
    null,
  );
  const [rejectTarget, setRejectTarget] = useState<AdminWithdrawal | null>(null);
  const [paidTarget, setPaidTarget] = useState<AdminWithdrawal | null>(null);

  const withdrawalsQuery = useQuery({
    queryKey: withdrawalsQueryKey(page),
    queryFn: () => getAdminWithdrawals(page, pageSize),
  });

  const approveMutation = useAdminMutation({
    mutationFn: (withdrawalId: string) => approveWithdrawal(withdrawalId),
    successMessage: "Withdrawal approved.",
    errorMessage: "The withdrawal could not be approved.",
    invalidateQueryKeys: [["admin", "withdrawals"]],
    onSuccess: () => {
      setApproveTarget(null);
    },
  });

  const rejectMutation = useAdminMutation({
    mutationFn: ({
      withdrawalId,
      adminNote,
    }: {
      withdrawalId: string;
      adminNote: string;
    }) => rejectWithdrawal(withdrawalId, adminNote),
    successMessage: "Withdrawal rejected.",
    errorMessage: "The withdrawal could not be rejected.",
    invalidateQueryKeys: [["admin", "withdrawals"]],
    onSuccess: () => {
      setRejectTarget(null);
    },
  });

  const markPaidMutation = useAdminMutation({
    mutationFn: ({
      withdrawalId,
      payoutRef,
    }: {
      withdrawalId: string;
      payoutRef?: string;
    }) => markWithdrawalPaid(withdrawalId, payoutRef),
    successMessage: "Withdrawal marked as paid.",
    errorMessage: "The payout could not be marked as paid.",
    invalidateQueryKeys: [["admin", "withdrawals"]],
    onSuccess: () => {
      setPaidTarget(null);
    },
  });

  const summary = useMemo(() => {
    const items = withdrawalsQuery.data?.items ?? [];

    return {
      pending: items.filter((withdrawal) => withdrawal.status === "PENDING")
        .length,
      approved: items.filter((withdrawal) => withdrawal.status === "APPROVED")
        .length,
    };
  }, [withdrawalsQuery.data?.items]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Withdrawals"
        description="Approve legitimate cash-outs, reject failed requests with an internal note, and mark paid withdrawals once payout leaves the business account."
      />

      <Card>
        <CardHeader className="gap-3 border-b border-border/60">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle>Withdrawal operations</CardTitle>
              <CardDescription>
                Keep the payout queue moving while preserving a clear audit trail
                for every approval, rejection, and paid status update.
              </CardDescription>
            </div>
            <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
              <div className="font-medium text-foreground">
                {summary.pending.toLocaleString()} pending approvals
              </div>
              <div className="text-muted-foreground">
                {summary.approved.toLocaleString()} approved and awaiting payout
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-0 pt-0">
          {withdrawalsQuery.isLoading ? (
            <AdminTableSkeleton columns={7} />
          ) : withdrawalsQuery.isError ? (
            <AdminErrorState
              title="Could not load withdrawals"
              description={getApiErrorMessage(
                withdrawalsQuery.error,
                "Please try refreshing the withdrawal queue.",
              )}
              onRetry={() => withdrawalsQuery.refetch()}
            />
          ) : !withdrawalsQuery.data || withdrawalsQuery.data.items.length === 0 ? (
            <AdminEmptyState
              title="No withdrawals yet"
              description="Player cash-out requests will appear here once the first withdrawals are created."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Receiver</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {withdrawalsQuery.data.items.map((withdrawal) => {
                    const canApprove = withdrawal.status === "PENDING";
                    const canReject = reversibleStatuses.has(withdrawal.status);
                    const canMarkPaid = withdrawal.status === "APPROVED";

                    return (
                      <TableRow key={withdrawal.id}>
                        <TableCell>
                          <div className="min-w-[180px]">
                            <div className="font-medium">{withdrawal.user.fullName}</div>
                            <div className="text-xs text-muted-foreground">
                              {withdrawal.user.phoneNumber}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{withdrawal.provider}</TableCell>
                        <TableCell>
                          <div className="min-w-[170px]">
                            <div>{withdrawal.receiverPhone ?? "-"}</div>
                            <div className="text-xs text-muted-foreground">
                              {withdrawal.receiverAccount ?? "No account provided"}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <AdminStatusBadge status={withdrawal.status} />
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(withdrawal.amount)}
                        </TableCell>
                        <TableCell>{formatDateTime(withdrawal.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!canApprove}
                              onClick={() => setApproveTarget(withdrawal)}
                            >
                              <BadgeCheck className="size-4" />
                              Approve
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={!canReject}
                              onClick={() => setRejectTarget(withdrawal)}
                            >
                              <XCircle className="size-4" />
                              Reject
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={!canMarkPaid}
                              onClick={() => setPaidTarget(withdrawal)}
                            >
                              <Send className="size-4" />
                              Mark paid
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <AdminPagination
                pagination={withdrawalsQuery.data.pagination}
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
        title="Approve withdrawal"
        description={
          approveTarget
            ? `Approve ${formatCurrency(approveTarget.amount)} for ${approveTarget.user.fullName}. This keeps the funds locked and moves the request to the payout step.`
            : "Approve this withdrawal."
        }
        confirmLabel="Approve withdrawal"
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
        title="Reject withdrawal"
        description={
          rejectTarget
            ? `Reject ${formatCurrency(rejectTarget.amount)} for ${rejectTarget.user.fullName}. The locked funds will be returned to the player's available balance.`
            : "Reject this withdrawal."
        }
        confirmLabel="Reject withdrawal"
        confirmVariant="destructive"
        field={{
          label: "Admin note",
          placeholder: "Add an internal note for this rejection",
          required: true,
        }}
        onConfirm={(value) => {
          if (!rejectTarget || !value?.trim()) {
            return;
          }

          rejectMutation.mutate({
            withdrawalId: rejectTarget.id,
            adminNote: value.trim(),
          });
        }}
        isPending={rejectMutation.isPending}
      />

      <ConfirmActionDialog
        open={Boolean(paidTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setPaidTarget(null);
          }
        }}
        title="Mark withdrawal paid"
        description={
          paidTarget
            ? `Confirm payout for ${formatCurrency(paidTarget.amount)} to ${paidTarget.user.fullName}. This will release the locked funds from the wallet ledger.`
            : "Mark this withdrawal as paid."
        }
        confirmLabel="Mark paid"
        field={{
          label: "Payout reference",
          placeholder: "Optional bank or transfer reference",
        }}
        onConfirm={(value) => {
          if (!paidTarget) {
            return;
          }

          markPaidMutation.mutate({
            withdrawalId: paidTarget.id,
            payoutRef: value?.trim() || undefined,
          });
        }}
        isPending={markPaidMutation.isPending}
      />
    </div>
  );
}
