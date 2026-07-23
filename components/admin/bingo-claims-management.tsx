"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ChevronRight, XCircle } from "lucide-react";

import {
  approveAdminBingoClaim,
  getAdminBingoClaims,
  rejectAdminBingoClaim,
} from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { AdminBingoClaim } from "@/lib/api/types";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { ConfirmActionDialog } from "@/components/admin/confirm-action-dialog";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { AdminTableSkeleton } from "@/components/admin/admin-table-skeleton";
import {
  AdminEmptyState,
  AdminErrorState,
} from "@/components/admin/admin-table-state";
import { useAdminMutation } from "@/lib/admin/use-admin-mutation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
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
import { cn } from "@/lib/utils";

const pageSize = 20;
const bingoClaimsQueryKey = (page: number) =>
  ["admin", "bingo-claims", page] as const;

type ClaimGameGroup = {
  gameSessionId: string;
  playCode: string;
  prizeAmount: string;
  slotName: string;
  ruleName: string;
  ruleKey: string;
  gameType: string;
  isManualRule: boolean;
  latestCreatedAt: string;
  claims: AdminBingoClaim[];
  pendingCount: number;
};

function groupClaimsByGame(claims: AdminBingoClaim[]): ClaimGameGroup[] {
  const order: string[] = [];
  const bySession = new Map<string, AdminBingoClaim[]>();

  for (const claim of claims) {
    const sessionId = claim.gameSessionId;
    const existing = bySession.get(sessionId);
    if (existing) {
      existing.push(claim);
    } else {
      order.push(sessionId);
      bySession.set(sessionId, [claim]);
    }
  }

  return order.map((sessionId) => {
    const sessionClaims = bySession.get(sessionId) ?? [];
    const first = sessionClaims[0]!;
    const slot = first.gameSession.gameSlot;
    const rule = slot.gameRule;
    const isManualRule =
      rule?.key === "MANUAL" || slot.gameType === "MANUAL";

    const sorted = [...sessionClaims].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return {
      gameSessionId: sessionId,
      playCode: first.gameSession.playCode,
      prizeAmount: first.gameSession.prizeAmount,
      slotName: slot.name,
      ruleName: rule?.name ?? first.checkedPattern ?? slot.gameType,
      ruleKey: rule?.key ?? first.checkedPattern ?? slot.gameType,
      gameType: slot.gameType,
      isManualRule,
      latestCreatedAt: sorted[0]?.createdAt ?? first.createdAt,
      claims: sorted,
      pendingCount: sessionClaims.filter((claim) => claim.status === "PENDING")
        .length,
    };
  });
}

function statusCounts(claims: AdminBingoClaim[]) {
  return claims.reduce(
    (acc, claim) => {
      acc[claim.status] += 1;
      return acc;
    },
    { PENDING: 0, VALID: 0, INVALID: 0 } as Record<
      AdminBingoClaim["status"],
      number
    >,
  );
}

export function BingoClaimsManagement() {
  const [page, setPage] = useState(1);
  const [expandedGames, setExpandedGames] = useState<Set<string>>(
    () => new Set(),
  );
  const [approveTarget, setApproveTarget] = useState<AdminBingoClaim | null>(
    null,
  );
  const [rejectTarget, setRejectTarget] = useState<AdminBingoClaim | null>(
    null,
  );

  const toggleGameExpanded = (gameSessionId: string) => {
    setExpandedGames((current) => {
      const next = new Set(current);
      if (next.has(gameSessionId)) {
        next.delete(gameSessionId);
      } else {
        next.add(gameSessionId);
      }
      return next;
    });
  };

  const claimsQuery = useQuery({
    queryKey: bingoClaimsQueryKey(page),
    queryFn: () => getAdminBingoClaims(page, pageSize),
  });

  const approveMutation = useAdminMutation({
    mutationFn: (claimId: string) => approveAdminBingoClaim(claimId),
    successMessage: "Bingo claim approved.",
    errorMessage: "The bingo claim could not be approved.",
    invalidateQueryKeys: [
      ["admin", "bingo-claims"],
      ["games", "operations", "current"],
    ],
    onSuccess: () => {
      setApproveTarget(null);
    },
  });

  const rejectMutation = useAdminMutation({
    mutationFn: ({ claimId, reason }: { claimId: string; reason: string }) =>
      rejectAdminBingoClaim(claimId, reason),
    successMessage: "Bingo claim rejected.",
    errorMessage: "The bingo claim could not be rejected.",
    invalidateQueryKeys: [["admin", "bingo-claims"]],
    onSuccess: () => {
      setRejectTarget(null);
    },
  });

  const gameGroups = useMemo(
    () => groupClaimsByGame(claimsQuery.data?.items ?? []),
    [claimsQuery.data?.items],
  );

  const summary = useMemo(() => {
    const items = claimsQuery.data?.items ?? [];
    return {
      pending: items.filter((claim) => claim.status === "PENDING").length,
      games: gameGroups.length,
    };
  }, [claimsQuery.data?.items, gameGroups.length]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-3 border-b border-border/60">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle>Claims queue</CardTitle>
              <p className="text-sm text-muted-foreground">
                Claims are grouped by game and collapsed by default. Expand a
                row to review cartelas.
              </p>
            </div>
            <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
              <div className="font-medium text-foreground">
                {summary.pending.toLocaleString()} pending review
              </div>
              <div className="text-muted-foreground">
                Across {summary.games.toLocaleString()} game
                {summary.games === 1 ? "" : "s"} on this page
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-0 pt-0">
          {claimsQuery.isLoading ? (
            <AdminTableSkeleton columns={5} />
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
                    <TableHead>Claims</TableHead>
                    <TableHead>Latest</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gameGroups.map((group) => {
                    const expanded = expandedGames.has(group.gameSessionId);
                    const counts = statusCounts(group.claims);

                    return (
                      <TableRow key={group.gameSessionId}>
                        <TableCell className="align-top">
                          <div className="min-w-[180px]">
                            <button
                              type="button"
                              className="flex w-full items-start gap-2 rounded-md text-left hover:bg-muted/40"
                              aria-expanded={expanded}
                              onClick={() =>
                                toggleGameExpanded(group.gameSessionId)
                              }
                            >
                              <span className="mt-0.5 text-muted-foreground">
                                {expanded ? (
                                  <ChevronDown className="size-4" />
                                ) : (
                                  <ChevronRight className="size-4" />
                                )}
                              </span>
                              <span className="min-w-0">
                                <span className="block font-medium">
                                  {group.playCode}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  Slot {group.slotName} · {group.ruleName}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  Prize {formatCurrency(group.prizeAmount)}
                                </span>
                              </span>
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="min-w-[120px]">
                            <div className="font-medium">{group.ruleName}</div>
                            <div className="text-xs text-muted-foreground">
                              {group.ruleKey}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="min-w-[280px] space-y-2">
                            <button
                              type="button"
                              className="flex w-full flex-wrap items-center gap-2 rounded-md text-left"
                              aria-expanded={expanded}
                              onClick={() =>
                                toggleGameExpanded(group.gameSessionId)
                              }
                            >
                              <span className="text-sm font-medium">
                                {group.claims.length} claim
                                {group.claims.length === 1 ? "" : "s"}
                              </span>
                              {counts.VALID > 0 ? (
                                <Badge
                                  variant="outline"
                                  className="text-emerald-700"
                                >
                                  {counts.VALID} valid
                                </Badge>
                              ) : null}
                              {counts.INVALID > 0 ? (
                                <Badge variant="secondary">
                                  {counts.INVALID} invalid
                                </Badge>
                              ) : null}
                              {counts.PENDING > 0 ? (
                                <Badge
                                  variant="outline"
                                  className="text-amber-700"
                                >
                                  {counts.PENDING} pending
                                </Badge>
                              ) : null}
                              <span className="text-xs text-muted-foreground">
                                {expanded ? "Hide details" : "Show details"}
                              </span>
                            </button>

                            {!expanded ? (
                              <div className="flex flex-wrap gap-1.5">
                                {group.claims.map((claim) => (
                                  <Badge
                                    key={claim.id}
                                    variant="outline"
                                    className={cn(
                                      "font-normal",
                                      claim.status === "VALID" &&
                                        "border-emerald-300 text-emerald-800",
                                      claim.status === "PENDING" &&
                                        "border-amber-300 text-amber-800",
                                    )}
                                  >
                                    #{claim.gameCartela.cartela.number}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <div className="flex flex-col gap-2">
                                {group.claims.map((claim) => (
                                  <div
                                    key={claim.id}
                                    className={cn(
                                      "rounded-lg border border-border/60 px-3 py-2",
                                      claim.status === "VALID" &&
                                        "border-emerald-300/70 bg-emerald-50/50",
                                      claim.status === "INVALID" &&
                                        "border-border/50 bg-muted/30",
                                      claim.status === "PENDING" &&
                                        "border-amber-300/70 bg-amber-50/40",
                                    )}
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="font-medium">
                                          #{claim.gameCartela.cartela.number}
                                          <span className="ml-2 text-sm font-normal text-muted-foreground">
                                            {claim.user.fullName}
                                          </span>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          {claim.user.phoneNumber}
                                        </div>
                                      </div>
                                      <AdminStatusBadge status={claim.status} />
                                    </div>
                                    {group.isManualRule &&
                                    claim.status === "PENDING" ? (
                                      <div className="mt-2 flex flex-wrap justify-end gap-2">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() =>
                                            setApproveTarget(claim)
                                          }
                                        >
                                          <CheckCircle2 className="size-4" />
                                          Approve
                                        </Button>
                                        <Button
                                          variant="destructive"
                                          size="sm"
                                          onClick={() =>
                                            setRejectTarget(claim)
                                          }
                                        >
                                          <XCircle className="size-4" />
                                          Reject
                                        </Button>
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="align-top whitespace-nowrap">
                          {formatDateTime(group.latestCreatedAt)}
                        </TableCell>
                        <TableCell className="align-top text-right">
                          {group.isManualRule ? (
                            group.pendingCount > 0 ? (
                              <Badge variant="outline">
                                {group.pendingCount} to review
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Reviewed
                              </span>
                            )
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Auto-resolved
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <AdminPagination
                pagination={claimsQuery.data.pagination}
                onPageChange={(nextPage) => {
                  setExpandedGames(new Set());
                  setPage(nextPage);
                }}
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
        title="Approve bingo claim"
        description={
          approveTarget
            ? `Approve cartela #${approveTarget.gameCartela.cartela.number} for ${approveTarget.user.fullName}. This will finish ${approveTarget.gameSession.playCode} and pay ${formatCurrency(approveTarget.gameSession.prizeAmount)}.`
            : "Approve this bingo claim."
        }
        confirmLabel="Approve claim"
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
