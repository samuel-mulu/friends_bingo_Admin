"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";

import { approveDeposit, getAdminDeposits, rejectDeposit } from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { AdminDeposit } from "@/lib/api/types";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { ActionDialog } from "@/components/admin/action-dialog";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { AdminTableSkeleton } from "@/components/admin/admin-table-skeleton";
import {
  AdminEmptyState,
  AdminErrorState,
} from "@/components/admin/admin-table-state";
import { PageHeader } from "@/components/admin/page-header";
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
const actionableStatuses = new Set(["PENDING", "MANUAL_REVIEW", "VERIFYING"]);

export function DepositsManagement() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [approveTarget, setApproveTarget] = useState<AdminDeposit | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminDeposit | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const depositsQuery = useQuery({
    queryKey: depositsQueryKey(page),
    queryFn: () => getAdminDeposits(page, pageSize),
  });

  const approveMutation = useMutation({
    mutationFn: (depositId: string) => approveDeposit(depositId),
    onSuccess: async () => {
      setApproveTarget(null);
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "deposits"] });
    },
    onError: (error) => {
      setActionError(
        getApiErrorMessage(error, "The deposit could not be approved."),
      );
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({
      depositId,
      rejectionReason,
    }: {
      depositId: string;
      rejectionReason: string;
    }) => rejectDeposit(depositId, rejectionReason),
    onSuccess: async () => {
      setRejectTarget(null);
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "deposits"] });
    },
    onError: (error) => {
      setActionError(
        getApiErrorMessage(error, "The deposit could not be rejected."),
      );
    },
  });

  const summary = useMemo(() => {
    const items = depositsQuery.data?.items ?? [];
    const pendingReview = items.filter((deposit) =>
      actionableStatuses.has(deposit.status),
    ).length;

    return { pendingReview };
  }, [depositsQuery.data?.items]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deposits"
        description="Review incoming deposit requests, approve verified payments, and capture clear rejection reasons when a credit should not reach the wallet."
      />

      <Card>
        <CardHeader className="gap-3 border-b border-border/60">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle>Deposit queue</CardTitle>
              <CardDescription>
                Monitor automated verification outcomes and complete any manual
                finance decisions from one place.
              </CardDescription>
            </div>
            <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
              <div className="font-medium text-foreground">
                {summary.pendingReview.toLocaleString()} awaiting action
              </div>
              <div className="text-muted-foreground">
                Pending, verifying, or manual review
              </div>
            </div>
          </div>
          {actionError ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {actionError}
            </div>
          ) : null}
        </CardHeader>

        <CardContent className="px-0 pt-0">
          {depositsQuery.isLoading ? (
            <AdminTableSkeleton columns={7} />
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
                    <TableHead>Transaction Ref</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {depositsQuery.data.items.map((deposit) => {
                    const canReview = actionableStatuses.has(deposit.status);

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
                          <AdminStatusBadge status={deposit.status} />
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(deposit.amount)}
                        </TableCell>
                        <TableCell>{formatDateTime(deposit.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!canReview}
                              onClick={() => {
                                setActionError(null);
                                setApproveTarget(deposit);
                              }}
                            >
                              <CheckCircle2 className="size-4" />
                              Approve
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={!canReview}
                              onClick={() => {
                                setActionError(null);
                                setRejectTarget(deposit);
                              }}
                            >
                              <XCircle className="size-4" />
                              Reject
                            </Button>
                          </div>
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

      <ActionDialog
        open={Boolean(approveTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setApproveTarget(null);
            setActionError(null);
          }
        }}
        title="Approve deposit"
        description={
          approveTarget
            ? `Credit ${formatCurrency(approveTarget.amount)} for ${approveTarget.user.fullName}. This will approve ${approveTarget.transactionRef} and push the wallet update immediately.`
            : "Approve this deposit."
        }
        confirmLabel="Approve deposit"
        errorMessage={approveTarget ? actionError : null}
        onConfirm={() => {
          if (!approveTarget) {
            return;
          }

          approveMutation.mutate(approveTarget.id);
        }}
        isPending={approveMutation.isPending}
      />

      <ActionDialog
        open={Boolean(rejectTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setActionError(null);
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
        errorMessage={rejectTarget ? actionError : null}
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
