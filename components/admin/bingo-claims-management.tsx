"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";

import {
  approveAdminBingoClaim,
  getAdminBingoClaims,
  rejectAdminBingoClaim,
} from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { AdminBingoClaim } from "@/lib/api/types";
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
const bingoClaimsQueryKey = (page: number) =>
  ["admin", "bingo-claims", page] as const;

export function BingoClaimsManagement() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [approveTarget, setApproveTarget] = useState<AdminBingoClaim | null>(
    null,
  );
  const [rejectTarget, setRejectTarget] = useState<AdminBingoClaim | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const claimsQuery = useQuery({
    queryKey: bingoClaimsQueryKey(page),
    queryFn: () => getAdminBingoClaims(page, pageSize),
  });

  const approveMutation = useMutation({
    mutationFn: (claimId: string) => approveAdminBingoClaim(claimId),
    onSuccess: async () => {
      setApproveTarget(null);
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "bingo-claims"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "games"] });
    },
    onError: (error) => {
      setActionError(
        getApiErrorMessage(error, "The bingo claim could not be approved."),
      );
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({
      claimId,
      reason,
    }: {
      claimId: string;
      reason: string;
    }) => rejectAdminBingoClaim(claimId, reason),
    onSuccess: async () => {
      setRejectTarget(null);
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "bingo-claims"] });
    },
    onError: (error) => {
      setActionError(
        getApiErrorMessage(error, "The bingo claim could not be rejected."),
      );
    },
  });

  const summary = useMemo(() => {
    const items = claimsQuery.data?.items ?? [];
    return {
      pending: items.filter((claim) => claim.status === "PENDING").length,
    };
  }, [claimsQuery.data?.items]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bingo Claims"
        description="Review pending player bingo claims, confirm valid winners, and reject invalid submissions before the game result is finalized."
      />

      <Card>
        <CardHeader className="gap-3 border-b border-border/60">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle>Claims queue</CardTitle>
              <CardDescription>
                Manual claim review is the MVP source of truth for deciding the
                winner and finalizing prize payout.
              </CardDescription>
            </div>
            <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
              <div className="font-medium text-foreground">
                {summary.pending.toLocaleString()} pending review
              </div>
              <div className="text-muted-foreground">
                Pending claims waiting for admin action
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
          {claimsQuery.isLoading ? (
            <AdminTableSkeleton columns={7} />
          ) : claimsQuery.isError ? (
            <AdminErrorState
              title="Could not load bingo claims"
              description={getApiErrorMessage(
                claimsQuery.error,
                "Please try refreshing the claims queue.",
              )}
              onRetry={() => claimsQuery.refetch()}
            />
          ) : !claimsQuery.data || claimsQuery.data.items.length === 0 ? (
            <AdminEmptyState
              title="No bingo claims yet"
              description="Player bingo claims will appear here once live games are in progress."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Game</TableHead>
                    <TableHead>Rule</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead>Cartela</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {claimsQuery.data.items.map((claim) => {
                    const canReview = claim.status === "PENDING";

                    return (
                      <TableRow key={claim.id}>
                        <TableCell>
                          <div className="min-w-[150px]">
                            <div className="font-medium">{claim.game.code}</div>
                            <div className="text-xs text-muted-foreground">
                              Prize {formatCurrency(claim.game.prizeAmount)}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="min-w-[140px]">
                            <div className="font-medium">
                              {claim.game.gameRule?.name ?? claim.checkedPattern ?? "-"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {claim.game.gameRule?.key ?? claim.checkedPattern ?? "-"}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="min-w-[180px]">
                            <div className="font-medium">{claim.user.fullName}</div>
                            <div className="text-xs text-muted-foreground">
                              {claim.user.phoneNumber}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          #{claim.gameCartela.cartela.number}
                        </TableCell>
                        <TableCell>
                          <AdminStatusBadge status={claim.status} />
                        </TableCell>
                        <TableCell>{formatDateTime(claim.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!canReview}
                              onClick={() => {
                                setActionError(null);
                                setApproveTarget(claim);
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
                                setRejectTarget(claim);
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
                pagination={claimsQuery.data.pagination}
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
        title="Approve bingo claim"
        description={
          approveTarget
            ? `Approve cartela #${approveTarget.gameCartela.cartela.number} for ${approveTarget.user.fullName}. This will finish ${approveTarget.game.code} and pay the configured prize.`
            : "Approve this bingo claim."
        }
        confirmLabel="Approve claim"
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
        title="Reject bingo claim"
        description={
          rejectTarget
            ? `Reject cartela #${rejectTarget.gameCartela.cartela.number} for ${rejectTarget.user.fullName}. The cartela will be blocked from claiming again.`
            : "Reject this bingo claim."
        }
        confirmLabel="Reject claim"
        confirmVariant="destructive"
        field={{
          label: "Rejection reason",
          placeholder: "Explain why this claim is being rejected",
          required: true,
        }}
        errorMessage={rejectTarget ? actionError : null}
        onConfirm={(value) => {
          if (!rejectTarget || !value?.trim()) {
            return;
          }

          rejectMutation.mutate({
            claimId: rejectTarget.id,
            reason: value.trim(),
          });
        }}
        isPending={rejectMutation.isPending}
      />
    </div>
  );
}
