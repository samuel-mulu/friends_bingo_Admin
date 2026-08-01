"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, RotateCcw, Search, XCircle } from "lucide-react";

import { approveDeposit, getAdminDeposits, rejectDeposit } from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { AdminDeposit, AdminDepositProviderOption, DepositStatus, PaymentProvider } from "@/lib/api/types";
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
import { pendingDepositsCountQueryKey } from "@/lib/admin/use-pending-deposits-count";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const pageSize = 20;
const ALL_PROVIDERS = "all" as const;
const ALL_STATUSES = "all" as const;
const DATE_MODE_ALL = "all" as const;
const DATE_MODE_RANGE = "range" as const;

type ProviderFilter = typeof ALL_PROVIDERS | PaymentProvider;
type StatusFilter = typeof ALL_STATUSES | DepositStatus;
type DateMode = typeof DATE_MODE_ALL | typeof DATE_MODE_RANGE;

const depositsQueryKey = (
  page: number,
  search: string,
  provider: ProviderFilter,
  status: StatusFilter,
  dateMode: DateMode,
  from: string,
  to: string,
) =>
  ["admin", "deposits", page, search, provider, status, dateMode, from, to] as const;

const actionableStatuses = new Set(["PENDING"]);

function verificationSourceLabel(source?: string | null): string | null {
  if (!source) {
    return null;
  }

  switch (source) {
    case "verify.et":
      return "verify.et";
    case "telebirr.local":
      return "local";
    case "manual.pending":
      return "manual.pending";
    case "Manual admin approval":
      return "manual.admin";
    default:
      return source;
  }
}

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
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [providerFilter, setProviderFilter] =
    useState<ProviderFilter>(ALL_PROVIDERS);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(ALL_STATUSES);
  const [dateMode, setDateMode] = useState<DateMode>(DATE_MODE_ALL);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [approveTarget, setApproveTarget] = useState<AdminDeposit | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminDeposit | null>(null);
  const [providerOptions, setProviderOptions] = useState<
    AdminDepositProviderOption[]
  >([]);

  const activeFrom = dateMode === DATE_MODE_RANGE ? fromDate : "";
  const activeTo = dateMode === DATE_MODE_RANGE ? toDate : "";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const depositsQuery = useQuery({
    queryKey: depositsQueryKey(
      page,
      debouncedSearch,
      providerFilter,
      statusFilter,
      dateMode,
      activeFrom,
      activeTo,
    ),
    queryFn: () =>
      getAdminDeposits(page, pageSize, {
        search: debouncedSearch || undefined,
        provider:
          providerFilter === ALL_PROVIDERS ? undefined : providerFilter,
        status: statusFilter === ALL_STATUSES ? undefined : statusFilter,
        from: activeFrom || undefined,
        to: activeTo || undefined,
      }),
  });

  useEffect(() => {
    const providers = depositsQuery.data?.summary?.providers;
    if (providers?.length) {
      setProviderOptions(providers);
    }
  }, [depositsQuery.data?.summary?.providers]);

  const approveMutation = useAdminMutation({
    mutationFn: ({
      depositId,
      approvalPin,
    }: {
      depositId: string;
      approvalPin: string;
    }) => approveDeposit(depositId, approvalPin),
    successMessage: "Deposit approved.",
    errorMessage: "The deposit could not be approved.",
    invalidateQueryKeys: [["admin", "deposits"], pendingDepositsCountQueryKey],
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
    invalidateQueryKeys: [["admin", "deposits"], pendingDepositsCountQueryKey],
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

  const hasActiveFilters =
    Boolean(debouncedSearch) ||
    providerFilter !== ALL_PROVIDERS ||
    statusFilter !== ALL_STATUSES ||
    dateMode !== DATE_MODE_ALL;

  const resetFilters = () => {
    setSearchInput("");
    setDebouncedSearch("");
    setProviderFilter(ALL_PROVIDERS);
    setStatusFilter(ALL_STATUSES);
    setDateMode(DATE_MODE_ALL);
    setFromDate("");
    setToDate("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-3 border-b border-border/60">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle>Deposit history</CardTitle>
              <CardDescription>
                Search by reference, name, or phone. Filter by payment method
                and date. Most deposits verify automatically.
              </CardDescription>
            </div>
            <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
              <div className="font-medium text-foreground">
                {summary.pendingReview.toLocaleString()} awaiting action
              </div>
              <div className="text-muted-foreground">Pending only</div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="relative w-full sm:w-[280px]">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search reference, name, or phone"
                  className="pl-9"
                />
              </div>
              <Select
                value={providerFilter}
                onValueChange={(value) => {
                  setProviderFilter(value as ProviderFilter);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Payment method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_PROVIDERS}>All methods</SelectItem>
                  {providerOptions.map((provider) => (
                    <SelectItem key={provider.key} value={provider.key}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as StatusFilter);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
                  <SelectItem value="PENDING">Pending review</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant={statusFilter === "PENDING" ? "default" : "outline"}
                onClick={() => {
                  setStatusFilter(
                    statusFilter === "PENDING" ? ALL_STATUSES : "PENDING",
                  );
                  setPage(1);
                }}
              >
                Pending review
              </Button>
              <Select
                value={dateMode}
                onValueChange={(value) => {
                  const nextMode = value as DateMode;
                  setDateMode(nextMode);
                  if (nextMode === DATE_MODE_ALL) {
                    setFromDate("");
                    setToDate("");
                  }
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="Date" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DATE_MODE_ALL}>All dates</SelectItem>
                  <SelectItem value={DATE_MODE_RANGE}>Date range</SelectItem>
                </SelectContent>
              </Select>
              {hasActiveFilters ? (
                <Button variant="outline" onClick={resetFilters}>
                  <RotateCcw className="size-4" />
                  Reset filters
                </Button>
              ) : null}
            </div>

            {dateMode === DATE_MODE_RANGE ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="deposit-from"
                    className="text-xs text-muted-foreground"
                  >
                    From date
                  </Label>
                  <Input
                    id="deposit-from"
                    type="date"
                    value={fromDate}
                    onChange={(event) => {
                      setFromDate(event.target.value);
                      setPage(1);
                    }}
                    className="w-full sm:w-[180px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="deposit-to"
                    className="text-xs text-muted-foreground"
                  >
                    To date
                  </Label>
                  <Input
                    id="deposit-to"
                    type="date"
                    value={toDate}
                    onChange={(event) => {
                      setToDate(event.target.value);
                      setPage(1);
                    }}
                    className="w-full sm:w-[180px]"
                  />
                </div>
              </div>
            ) : null}
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
              title={hasActiveFilters ? "No matching deposits" : "No deposits yet"}
              description={
                hasActiveFilters
                  ? "Try a different search, payment method, or date range."
                  : "New deposit requests will appear here as players submit them."
              }
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
                    const providerLabel =
                      providerOptions.find(
                        (provider) => provider.key === deposit.provider,
                      )?.name ?? deposit.provider;

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
                        <TableCell>{providerLabel}</TableCell>
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
                          {verificationSourceLabel(
                            deposit.verifiedData?.verificationSource,
                          ) ? (
                            <div className="mt-1">
                              <Badge variant="outline" className="font-mono text-[10px]">
                                {verificationSourceLabel(
                                  deposit.verifiedData?.verificationSource,
                                )}
                              </Badge>
                            </div>
                          ) : null}
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
            ? `Credit ${formatCurrency(approveTarget.amount)} for ${approveTarget.user.fullName}. Enter the 6-digit approval PIN to approve ${approveTarget.transactionRef} and credit the wallet immediately.`
            : "Approve this deposit."
        }
        confirmLabel="Approve deposit"
        field={{
          label: "Approval PIN",
          placeholder: "Enter 6-digit PIN",
          required: true,
          minLength: 6,
          maxLength: 6,
          inputType: "password",
        }}
        onConfirm={(value) => {
          if (!approveTarget || !value?.trim()) {
            return;
          }

          approveMutation.mutate({
            depositId: approveTarget.id,
            approvalPin: value.trim(),
          });
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
