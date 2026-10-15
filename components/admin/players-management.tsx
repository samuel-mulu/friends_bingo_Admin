"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Bot,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  Eye,
  History,
  MessageSquare,
  ReceiptText,
  Search,
  ShieldCheck,
  Smartphone,
  Wallet,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

import {
  bulkUpdateAdminUserFeatureGrants,
  getAdminUserById,
  getAdminUsers,
  updateAdminUserFeatureGrants,
  updateAdminUserStatus,
} from "@/lib/api/admin";
import type {
  AdminUserDetail,
  BulkAdminUserFeatureGrantsResult,
  UpdateAdminUserFeatureGrantsPayload,
  UserFeatureSettingsSnapshot,
} from "@/lib/api/types";
import { getApiErrorMessage } from "@/lib/api/errors";
import { adminToast } from "@/lib/admin/admin-toast";
import { useAdminMutation } from "@/lib/admin/use-admin-mutation";
import {
  coerceMoneyAmount,
  formatCurrency,
  formatDateTime,
} from "@/lib/formatters";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { AdminTableSkeleton } from "@/components/admin/admin-table-skeleton";
import {
  AdminEmptyState,
  AdminErrorState,
} from "@/components/admin/admin-table-state";
import { ConfirmActionDialog } from "@/components/admin/confirm-action-dialog";
import { PlayerGameHistoryDialog } from "@/components/admin/player-game-history-dialog";
import { PlayerSendFeedbackDialog } from "@/components/admin/player-send-feedback-dialog";
import { PlayerTransactionHistoryDialog } from "@/components/admin/player-transaction-history-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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

const pageSize = 150;
type UserRoleFilter = "PLAYER" | "ADMIN";
type SortKey = "balance" | "createdAt";
type BulkGrantChoice = "no_change" | "grant" | "revoke";
type BulkTargetMode = "selected" | "filtered";
/** all = no filter; granted = true; revoked = false (not granted). */
type FeatureGrantFilter = "all" | "granted" | "revoked";

function grantFilterToBoolean(
  filter: FeatureGrantFilter,
): boolean | undefined {
  if (filter === "granted") return true;
  if (filter === "revoked") return false;
  return undefined;
}

function GrantStatusIcon({
  granted,
  label,
}: {
  granted: boolean;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        granted
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
          : "bg-muted text-muted-foreground",
      )}
      title={granted ? `${label}: Granted` : `${label}: Not granted`}
    >
      {granted ? (
        <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
      ) : (
        <Circle className="size-3.5 shrink-0" aria-hidden />
      )}
      <span>{granted ? "Granted" : "Off"}</span>
    </span>
  );
}

function buildBulkPatch(
  autoMark: BulkGrantChoice,
  autoBingo: BulkGrantChoice,
): UpdateAdminUserFeatureGrantsPayload | null {
  const patch: UpdateAdminUserFeatureGrantsPayload = {};
  if (autoMark === "grant") {
    patch.autoMarkGranted = true;
  } else if (autoMark === "revoke") {
    patch.autoMarkGranted = false;
  }
  if (autoBingo === "grant") {
    patch.autoBingoGranted = true;
  } else if (autoBingo === "revoke") {
    patch.autoBingoGranted = false;
  }
  if (
    patch.autoMarkGranted === undefined &&
    patch.autoBingoGranted === undefined
  ) {
    return null;
  }
  return patch;
}

function createOperationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

const usersQueryKey = (
  page: number,
  role: UserRoleFilter,
  search: string,
  sortBy: SortKey,
  autoMarkFilter: FeatureGrantFilter,
  autoBingoFilter: FeatureGrantFilter,
) =>
  [
    "admin",
    "users",
    page,
    role,
    search,
    sortBy,
    autoMarkFilter,
    autoBingoFilter,
  ] as const;
const userDetailQueryKey = (userId: string) =>
  ["admin", "users", userId] as const;

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

function applyFeatureSettingsToDetail(
  detail: AdminUserDetail,
  settings: UserFeatureSettingsSnapshot,
): AdminUserDetail {
  return {
    ...detail,
    autoMarkGranted: settings.autoMarkGranted,
    autoBingoGranted: settings.autoBingoGranted,
    autoMarkEnabled: settings.autoMarkEnabled,
    autoBingoEnabled: settings.autoBingoEnabled,
    effectiveAutoMark: settings.effectiveAutoMark,
    effectiveAutoBingo: settings.effectiveAutoBingo,
    featureSettingsVersion: settings.featureSettingsVersion,
  };
}

function featureFlagLabel(value: boolean | undefined) {
  return value ? "On" : "Off";
}

export function PlayersManagement() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState<UserRoleFilter>("PLAYER");
  const [sortBy, setSortBy] = useState<SortKey>("balance");
  const [autoMarkFilter, setAutoMarkFilter] =
    useState<FeatureGrantFilter>("all");
  const [autoBingoFilter, setAutoBingoFilter] =
    useState<FeatureGrantFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [gameHistoryOpen, setGameHistoryOpen] = useState(false);
  const [transactionHistoryOpen, setTransactionHistoryOpen] = useState(false);
  const [feedbackTarget, setFeedbackTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [banTarget, setBanTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [unbanTarget, setUnbanTarget] = useState<{
    id: string;
    name: string;
    reason: string | null;
  } | null>(null);
  const [revokeGrantTarget, setRevokeGrantTarget] = useState<{
    id: string;
    name: string;
    feature: "autoMark" | "autoBingo";
  } | null>(null);
  const [selectedPhoneIds, setSelectedPhoneIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const [bulkTargetMode, setBulkTargetMode] =
    useState<BulkTargetMode>("selected");
  const [bulkAutoMark, setBulkAutoMark] =
    useState<BulkGrantChoice>("no_change");
  const [bulkAutoBingo, setBulkAutoBingo] =
    useState<BulkGrantChoice>("no_change");
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkPreviewCount, setBulkPreviewCount] = useState<number | null>(null);
  const [bulkPreviewPending, setBulkPreviewPending] = useState(false);
  const [bulkResult, setBulkResult] =
    useState<BulkAdminUserFeatureGrantsResult | null>(null);
  const [bulkOperationId, setBulkOperationId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setSelectedPhoneIds(new Set());
  }, [page, roleFilter, debouncedSearch, sortBy, autoMarkFilter, autoBingoFilter]);

  const usersQuery = useQuery({
    queryKey: usersQueryKey(
      page,
      roleFilter,
      debouncedSearch,
      sortBy,
      autoMarkFilter,
      autoBingoFilter,
    ),
    queryFn: () =>
      getAdminUsers(page, pageSize, {
        role: roleFilter,
        search: debouncedSearch || undefined,
        sortBy,
        sortOrder: "desc",
        autoMarkGranted: grantFilterToBoolean(autoMarkFilter),
        autoBingoGranted: grantFilterToBoolean(autoBingoFilter),
      }),
  });

  const userDetailQuery = useQuery({
    queryKey: selectedUserId
      ? userDetailQueryKey(selectedUserId)
      : ["admin", "users", "detail"],
    queryFn: () => getAdminUserById(selectedUserId as string),
    enabled: Boolean(selectedUserId),
  });

  const banMutation = useAdminMutation({
    mutationFn: ({
      userId,
      reason,
    }: {
      userId: string;
      reason: string;
    }) =>
      updateAdminUserStatus(userId, {
        status: "BLOCKED",
        reason,
      }),
    successMessage: "Player banned",
    invalidateQueryKeys: [["admin", "users"]],
    onSuccess: () => {
      setBanTarget(null);
    },
  });

  const unbanMutation = useAdminMutation({
    mutationFn: ({ userId }: { userId: string }) =>
      updateAdminUserStatus(userId, { status: "ACTIVE" }),
    successMessage: "Player unbanned",
    invalidateQueryKeys: [["admin", "users"]],
    onSuccess: () => {
      setUnbanTarget(null);
    },
  });

  const featureGrantMutation = useAdminMutation({
    mutationFn: ({
      userId,
      payload,
    }: {
      userId: string;
      payload: UpdateAdminUserFeatureGrantsPayload;
    }) => updateAdminUserFeatureGrants(userId, payload),
    successMessage: "Player automation updated",
    invalidateQueryKeys: [["admin", "users"]],
    onSuccess: (settings, variables) => {
      queryClient.setQueryData<AdminUserDetail>(
        userDetailQueryKey(variables.userId),
        (current) =>
          current ? applyFeatureSettingsToDetail(current, settings) : current,
      );
      void queryClient.invalidateQueries({
        queryKey: userDetailQueryKey(variables.userId),
      });
      setRevokeGrantTarget(null);
    },
  });

  const bulkFeatureGrantMutation = useAdminMutation({
    mutationFn: ({
      operationId,
      patch,
    }: {
      operationId: string;
      patch: UpdateAdminUserFeatureGrantsPayload;
    }) => {
      if (bulkTargetMode === "selected") {
        return bulkUpdateAdminUserFeatureGrants({
          userIds: [...selectedPhoneIds],
          patch,
          operationId,
          dryRun: false,
        });
      }
      return bulkUpdateAdminUserFeatureGrants({
        filter: {
          role: roleFilter,
          search: debouncedSearch || undefined,
          autoMarkGranted: grantFilterToBoolean(autoMarkFilter),
          autoBingoGranted: grantFilterToBoolean(autoBingoFilter),
        },
        patch,
        operationId,
        dryRun: false,
      });
    },
    successMessage: "Bulk automation update finished",
    invalidateQueryKeys: [["admin", "users"]],
    onSuccess: (result) => {
      setBulkResult(result);
      setBulkConfirmOpen(false);
      setBulkPreviewCount(null);
      setBulkOperationId(null);
      if (bulkTargetMode === "selected" && result.failed === 0) {
        setSelectedPhoneIds(new Set());
      }
      if (selectedUserId) {
        void queryClient.invalidateQueries({
          queryKey: userDetailQueryKey(selectedUserId),
        });
      }
    },
  });

  const pageUsers = usersQuery.data?.items ?? [];
  const pageUserIds = useMemo(
    () => pageUsers.map((user) => user.id),
    [pageUsers],
  );
  const allPageSelected =
    pageUserIds.length > 0 &&
    pageUserIds.every((id) => selectedPhoneIds.has(id));
  const selectedCount = selectedPhoneIds.size;

  const selectedListUser = pageUsers.find((user) => user.id === selectedUserId);

  const availableBalance = (() => {
    const fromDetail =
      userDetailQuery.data?.wallet?.balance != null
        ? coerceMoneyAmount(userDetailQuery.data.wallet.balance)
        : null;
    const fromList =
      selectedListUser?.walletBalance != null
        ? coerceMoneyAmount(selectedListUser.walletBalance)
        : null;

    if (fromDetail != null && fromList != null) {
      if (fromDetail === "0" && fromList !== "0") {
        return fromList;
      }
      return fromDetail;
    }

    return fromDetail ?? fromList ?? "0";
  })();
  const lockedBalance = coerceMoneyAmount(
    userDetailQuery.data?.wallet?.lockedBalance,
  );

  const togglePhoneSelection = (userId: string, checked: boolean) => {
    setSelectedPhoneIds((previous) => {
      const next = new Set(previous);
      if (checked) {
        next.add(userId);
      } else {
        next.delete(userId);
      }
      return next;
    });
  };

  const toggleSelectAllOnPage = (checked: boolean) => {
    setSelectedPhoneIds((previous) => {
      const next = new Set(previous);
      for (const id of pageUserIds) {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      }
      return next;
    });
  };

  const handleCopyPhone = async (phoneNumber: string) => {
    try {
      await copyText(phoneNumber);
      setCopiedPhone(phoneNumber);
      window.setTimeout(() => {
        setCopiedPhone((current) =>
          current === phoneNumber ? null : current,
        );
      }, 1500);
      adminToast.success("Phone number copied.");
    } catch {
      adminToast.error("Could not copy phone number.");
    }
  };

  const handleCopySelectedPhones = async () => {
    const phones = pageUsers
      .filter((user) => selectedPhoneIds.has(user.id))
      .map((user) => user.phoneNumber);

    if (phones.length === 0) {
      adminToast.error("Select at least one phone number.");
      return;
    }

    try {
      await copyText(phones.join("\n"));
      adminToast.success(
        phones.length === 1
          ? "1 phone number copied."
          : `${phones.length} phone numbers copied.`,
      );
    } catch {
      adminToast.error("Could not copy phone numbers.");
    }
  };

  const openBulkConfirm = async () => {
    const patch = buildBulkPatch(bulkAutoMark, bulkAutoBingo);
    if (!patch) {
      adminToast.error("Choose Grant or Revoke for at least one feature.");
      return;
    }

    if (bulkTargetMode === "selected" && selectedCount === 0) {
      adminToast.error("Select at least one player, or use all filtered.");
      return;
    }

    setBulkPreviewPending(true);
    setBulkResult(null);
    try {
      const preview =
        bulkTargetMode === "selected"
          ? await bulkUpdateAdminUserFeatureGrants({
              userIds: [...selectedPhoneIds],
              patch,
              dryRun: true,
            })
          : await bulkUpdateAdminUserFeatureGrants({
              filter: {
                role: roleFilter,
                search: debouncedSearch || undefined,
                autoMarkGranted: grantFilterToBoolean(autoMarkFilter),
                autoBingoGranted: grantFilterToBoolean(autoBingoFilter),
              },
              patch,
              dryRun: true,
            });
      setBulkPreviewCount(preview.matched);
      setBulkOperationId(createOperationId());
      setBulkConfirmOpen(true);
    } catch (error) {
      adminToast.error(
        getApiErrorMessage(error, "Could not preview bulk targets."),
      );
    } finally {
      setBulkPreviewPending(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-3 border-b border-border/60">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle>Player directory</CardTitle>
              <CardDescription>
                Search by name or phone. Green check = feature granted. Use
                filters to show only granted or off players.
              </CardDescription>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="relative w-full sm:w-[240px]">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search name or phone"
                  className="pl-9"
                />
              </div>
              <Select
                value={sortBy}
                onValueChange={(value) => {
                  setSortBy(value as SortKey);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="balance">Balance (high → low)</SelectItem>
                  <SelectItem value="createdAt">Created (newest)</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={roleFilter}
                onValueChange={(value) => {
                  setRoleFilter(value as UserRoleFilter);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Filter by role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PLAYER">Players</SelectItem>
                  <SelectItem value="ADMIN">Admins</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={autoMarkFilter}
                onValueChange={(value) => {
                  setAutoMarkFilter(value as FeatureGrantFilter);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="Auto Mark" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Auto Mark: All</SelectItem>
                  <SelectItem value="granted">Auto Mark: Granted</SelectItem>
                  <SelectItem value="revoked">Auto Mark: Off</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={autoBingoFilter}
                onValueChange={(value) => {
                  setAutoBingoFilter(value as FeatureGrantFilter);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Auto Bingo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Auto Bingo: All</SelectItem>
                  <SelectItem value="granted">Auto Bingo: Granted</SelectItem>
                  <SelectItem value="revoked">Auto Bingo: Off</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" asChild>
                <Link href="/devices">
                  <Smartphone className="size-4" />
                  Devices
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={selectedCount === 0}
                onClick={() => void handleCopySelectedPhones()}
              >
                <Copy className="size-4" />
                Copy selected
                {selectedCount > 0 ? ` (${selectedCount})` : ""}
              </Button>
              <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
                <div className="font-medium text-foreground">
                  {usersQuery.data?.pagination.totalItems.toLocaleString() ??
                    "0"}{" "}
                  {roleFilter === "ADMIN" ? "admins" : "players"}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">Bulk grant / revoke</p>
                <p className="text-xs text-muted-foreground">
                  Choose who to update, then Grant or Revoke each feature.
                  &quot;Leave as-is&quot; skips that feature. Table filters above
                  also apply when using &quot;All matching filters&quot;.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={
                  bulkPreviewPending || bulkFeatureGrantMutation.isPending
                }
                onClick={() => void openBulkConfirm()}
              >
                {bulkPreviewPending ? "Checking…" : "Review & apply"}
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Who to update
                </p>
                <Select
                  value={bulkTargetMode}
                  onValueChange={(value) =>
                    setBulkTargetMode(value as BulkTargetMode)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="selected">
                      Checked rows ({selectedCount})
                    </SelectItem>
                    <SelectItem value="filtered">
                      All matching filters (
                      {usersQuery.data?.pagination.totalItems.toLocaleString() ??
                        "0"}
                      )
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Auto Mark action
                </p>
                <Select
                  value={bulkAutoMark}
                  onValueChange={(value) =>
                    setBulkAutoMark(value as BulkGrantChoice)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no_change">Leave as-is</SelectItem>
                    <SelectItem value="grant">Grant access</SelectItem>
                    <SelectItem value="revoke">Revoke access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Auto Bingo action
                </p>
                <Select
                  value={bulkAutoBingo}
                  onValueChange={(value) =>
                    setBulkAutoBingo(value as BulkGrantChoice)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no_change">Leave as-is</SelectItem>
                    <SelectItem value="grant">Grant access</SelectItem>
                    <SelectItem value="revoke">Revoke access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {bulkResult ? (
              <div className="rounded-lg border border-border/60 bg-background px-3 py-2 text-xs">
                <p className="font-medium">
                  Last bulk result
                  {bulkResult.idempotentReplay ? " (idempotent replay)" : ""}
                </p>
                <p className="text-muted-foreground">
                  Matched {bulkResult.matched.toLocaleString()} · Changed{" "}
                  {bulkResult.changed.toLocaleString()} · Unchanged{" "}
                  {bulkResult.unchanged.toLocaleString()} · Failed{" "}
                  {bulkResult.failed.toLocaleString()}
                </p>
              </div>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="px-0 pt-0">
          {usersQuery.isLoading ? (
            <AdminTableSkeleton columns={11} />
          ) : usersQuery.isError ? (
            <AdminErrorState
              title="Could not load players"
              description={getApiErrorMessage(
                usersQuery.error,
                "Please try refreshing the player directory.",
              )}
              onRetry={() => usersQuery.refetch()}
            />
          ) : !usersQuery.data || usersQuery.data.items.length === 0 ? (
            <AdminEmptyState
              title={
                roleFilter === "ADMIN" ? "No admins found" : "No players found"
              }
              description={
                debouncedSearch ||
                autoMarkFilter !== "all" ||
                autoBingoFilter !== "all"
                  ? "No accounts match this search or grant filter."
                  : roleFilter === "ADMIN"
                    ? "Admin accounts will appear here once they are created."
                    : "Player accounts will appear here once people start registering."
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <input
                        type="checkbox"
                        aria-label="Select all phone numbers on this page"
                        className="size-4 accent-primary"
                        checked={allPageSelected}
                        onChange={(event) =>
                          toggleSelectAllOnPage(event.target.checked)
                        }
                      />
                    </TableHead>
                    <TableHead className="w-14">#</TableHead>
                    <TableHead>Full name</TableHead>
                    <TableHead>Phone number</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Auto Mark</TableHead>
                    <TableHead>Auto Bingo</TableHead>
                    <TableHead className="text-right">Wallet balance</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersQuery.data.items.map((user, index) => {
                    const markGranted = user.autoMarkGranted === true;
                    const bingoGranted = user.autoBingoGranted === true;
                    const grantsBusy =
                      featureGrantMutation.isPending ||
                      banMutation.isPending ||
                      unbanMutation.isPending;
                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            aria-label={`Select ${user.phoneNumber}`}
                            className="size-4 accent-primary"
                            checked={selectedPhoneIds.has(user.id)}
                            onChange={(event) =>
                              togglePhoneSelection(
                                user.id,
                                event.target.checked,
                              )
                            }
                          />
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {(page - 1) * pageSize + index + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          {user.fullName}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span>{user.phoneNumber}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Copy ${user.phoneNumber}`}
                              onClick={() =>
                                void handleCopyPhone(user.phoneNumber)
                              }
                            >
                              {copiedPhone === user.phoneNumber ? (
                                <Check className="size-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="size-3.5" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{user.role}</Badge>
                        </TableCell>
                        <TableCell>
                          <AdminStatusBadge status={user.status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1.5">
                            <GrantStatusIcon
                              granted={markGranted}
                              label="Auto Mark"
                            />
                            {user.role === "PLAYER" ? (
                              <Button
                                type="button"
                                size="sm"
                                variant={markGranted ? "outline" : "default"}
                                className="h-7 px-2 text-xs"
                                disabled={grantsBusy}
                                onClick={() => {
                                  if (markGranted) {
                                    setRevokeGrantTarget({
                                      id: user.id,
                                      name: user.fullName,
                                      feature: "autoMark",
                                    });
                                    return;
                                  }
                                  featureGrantMutation.mutate({
                                    userId: user.id,
                                    payload: { autoMarkGranted: true },
                                  });
                                }}
                              >
                                {markGranted ? (
                                  <>
                                    <XCircle className="size-3.5" />
                                    Revoke
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="size-3.5" />
                                    Grant
                                  </>
                                )}
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1.5">
                            <GrantStatusIcon
                              granted={bingoGranted}
                              label="Auto Bingo"
                            />
                            {user.role === "PLAYER" ? (
                              <Button
                                type="button"
                                size="sm"
                                variant={bingoGranted ? "outline" : "default"}
                                className="h-7 px-2 text-xs"
                                disabled={grantsBusy}
                                onClick={() => {
                                  if (bingoGranted) {
                                    setRevokeGrantTarget({
                                      id: user.id,
                                      name: user.fullName,
                                      feature: "autoBingo",
                                    });
                                    return;
                                  }
                                  featureGrantMutation.mutate({
                                    userId: user.id,
                                    payload: { autoBingoGranted: true },
                                  });
                                }}
                              >
                                {bingoGranted ? (
                                  <>
                                    <XCircle className="size-3.5" />
                                    Revoke
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="size-3.5" />
                                    Grant
                                  </>
                                )}
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(user.walletBalance)}
                        </TableCell>
                        <TableCell>
                          {formatDateTime(user.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setFeedbackTarget({
                                  id: user.id,
                                  name: user.fullName,
                                })
                              }
                            >
                              <MessageSquare className="size-4" />
                              Send
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedUserId(user.id)}
                            >
                              <Eye className="size-4" />
                              View
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <AdminPagination
                pagination={usersQuery.data.pagination}
                onPageChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={Boolean(selectedUserId)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedUserId(null);
            setGameHistoryOpen(false);
            setTransactionHistoryOpen(false);
            setRevokeGrantTarget(null);
          }
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-xl">
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>Player details</SheetTitle>
          </SheetHeader>

          <div className="space-y-4 overflow-y-auto p-4">
            {userDetailQuery.isLoading ? (
              <AdminTableSkeleton columns={1} rows={6} />
            ) : userDetailQuery.isError ? (
              <AdminErrorState
                title="Could not load this player"
                description={getApiErrorMessage(
                  userDetailQuery.error,
                  "Please try opening the player again.",
                )}
                onRetry={() => userDetailQuery.refetch()}
              />
            ) : !userDetailQuery.data ? (
              <AdminEmptyState
                title="No player selected"
                description="Choose a player from the table to see the full profile."
              />
            ) : (
              <>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>{userDetailQuery.data.fullName}</CardTitle>
                    <CardDescription>
                      {userDetailQuery.data.phoneNumber}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2">
                    <DetailItem
                      label="Role"
                      value={
                        <Badge variant="outline">
                          {userDetailQuery.data.role}
                        </Badge>
                      }
                    />
                    <DetailItem
                      label="Status"
                      value={
                        <AdminStatusBadge
                          status={userDetailQuery.data.status}
                        />
                      }
                    />
                    <DetailItem
                      label="Created"
                      value={formatDateTime(userDetailQuery.data.createdAt)}
                    />
                    <DetailItem
                      label="Updated"
                      value={formatDateTime(userDetailQuery.data.updatedAt)}
                    />
                    {userDetailQuery.data.status === "BLOCKED" ? (
                      <>
                        <DetailItem
                          label="Ban reason"
                          value={
                            userDetailQuery.data.blockReason?.trim() ||
                            "No reason provided"
                          }
                        />
                        <DetailItem
                          label="Banned at"
                          value={
                            userDetailQuery.data.blockedAt
                              ? formatDateTime(userDetailQuery.data.blockedAt)
                              : "—"
                          }
                        />
                      </>
                    ) : null}
                  </CardContent>
                </Card>

                <Card size="sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Wallet className="size-4" />
                      Wallet
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2">
                    <DetailItem
                      label="Available"
                      value={formatCurrency(availableBalance)}
                    />
                    <DetailItem
                      label="Locked"
                      value={formatCurrency(lockedBalance)}
                    />
                    <DetailItem
                      label="Bonus cartelas"
                      value={String(
                        userDetailQuery.data.wallet?.bonusCartelaBalance ?? 0,
                      )}
                    />
                  </CardContent>
                </Card>

                <Card size="sm">
                  <CardHeader>
                    <CardTitle className="text-base">Activity</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2">
                    <DetailItem
                      label="Deposits"
                      value={String(userDetailQuery.data.counts.deposits)}
                    />
                    <DetailItem
                      label="Withdrawals"
                      value={String(userDetailQuery.data.counts.withdrawals)}
                    />
                    <DetailItem
                      label="Game cartelas"
                      value={String(userDetailQuery.data.counts.gameCartelas)}
                    />
                    <DetailItem
                      label="Wins"
                      value={String(userDetailQuery.data.counts.winnerCartelas)}
                    />
                    <DetailItem
                      label="Transactions"
                      value={String(userDetailQuery.data.counts.transactions)}
                    />
                  </CardContent>
                </Card>

                {userDetailQuery.data.role === "PLAYER" ? (
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Bot className="size-4" />
                        Player Automation
                      </CardTitle>
                      <CardDescription>
                        Admin grants access. The player still chooses whether to
                        turn each feature on.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-3 rounded-lg border border-border/70 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">Auto Mark access</p>
                            <p className="text-xs text-muted-foreground">
                              Admin permission only
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant={
                              userDetailQuery.data.autoMarkGranted
                                ? "outline"
                                : "default"
                            }
                            disabled={
                              featureGrantMutation.isPending ||
                              banMutation.isPending ||
                              unbanMutation.isPending
                            }
                            onClick={() => {
                              if (userDetailQuery.data.autoMarkGranted) {
                                setRevokeGrantTarget({
                                  id: userDetailQuery.data.id,
                                  name: userDetailQuery.data.fullName,
                                  feature: "autoMark",
                                });
                                return;
                              }
                              featureGrantMutation.mutate({
                                userId: userDetailQuery.data.id,
                                payload: { autoMarkGranted: true },
                              });
                            }}
                          >
                            {userDetailQuery.data.autoMarkGranted ? (
                              <>
                                <XCircle className="size-3.5" />
                                Revoke access
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="size-3.5" />
                                Grant access
                              </>
                            )}
                          </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <GrantStatusIcon
                            granted={Boolean(userDetailQuery.data.autoMarkGranted)}
                            label="Auto Mark"
                          />
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <DetailItem
                            label="Player turned on"
                            value={featureFlagLabel(
                              userDetailQuery.data.autoMarkEnabled,
                            )}
                          />
                          <DetailItem
                            label="Working now"
                            value={featureFlagLabel(
                              userDetailQuery.data.effectiveAutoMark,
                            )}
                          />
                        </div>
                      </div>

                      <div className="space-y-3 rounded-lg border border-border/70 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">
                              Auto Bingo access
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Admin permission only
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant={
                              userDetailQuery.data.autoBingoGranted
                                ? "outline"
                                : "default"
                            }
                            disabled={
                              featureGrantMutation.isPending ||
                              banMutation.isPending ||
                              unbanMutation.isPending
                            }
                            onClick={() => {
                              if (userDetailQuery.data.autoBingoGranted) {
                                setRevokeGrantTarget({
                                  id: userDetailQuery.data.id,
                                  name: userDetailQuery.data.fullName,
                                  feature: "autoBingo",
                                });
                                return;
                              }
                              featureGrantMutation.mutate({
                                userId: userDetailQuery.data.id,
                                payload: { autoBingoGranted: true },
                              });
                            }}
                          >
                            {userDetailQuery.data.autoBingoGranted ? (
                              <>
                                <XCircle className="size-3.5" />
                                Revoke access
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="size-3.5" />
                                Grant access
                              </>
                            )}
                          </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <GrantStatusIcon
                            granted={Boolean(
                              userDetailQuery.data.autoBingoGranted,
                            )}
                            label="Auto Bingo"
                          />
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <DetailItem
                            label="Player turned on"
                            value={featureFlagLabel(
                              userDetailQuery.data.autoBingoEnabled,
                            )}
                          />
                          <DetailItem
                            label="Working now"
                            value={featureFlagLabel(
                              userDetailQuery.data.effectiveAutoBingo,
                            )}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setFeedbackTarget({
                        id: userDetailQuery.data.id,
                        name: userDetailQuery.data.fullName,
                      })
                    }
                  >
                    <MessageSquare className="size-4" />
                    Send
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setGameHistoryOpen(true)}
                  >
                    <History className="size-4" />
                    Game history
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setTransactionHistoryOpen(true)}
                  >
                    <ReceiptText className="size-4" />
                    Transactions
                  </Button>
                  {userDetailQuery.data.role === "PLAYER" &&
                  userDetailQuery.data.status === "ACTIVE" ? (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() =>
                        setBanTarget({
                          id: userDetailQuery.data.id,
                          name: userDetailQuery.data.fullName,
                        })
                      }
                    >
                      <Ban className="size-4" />
                      Ban player
                    </Button>
                  ) : null}
                  {userDetailQuery.data.role === "PLAYER" &&
                  userDetailQuery.data.status === "BLOCKED" ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setUnbanTarget({
                          id: userDetailQuery.data.id,
                          name: userDetailQuery.data.fullName,
                          reason: userDetailQuery.data.blockReason,
                        })
                      }
                    >
                      <ShieldCheck className="size-4" />
                      Unban player
                    </Button>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmActionDialog
        open={Boolean(banTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setBanTarget(null);
          }
        }}
        title="Ban player"
        description={
          banTarget
            ? `Ban ${banTarget.name}. They will be kicked immediately and shown this reason with support contact details.`
            : "Ban this player."
        }
        confirmLabel="Ban player"
        confirmVariant="destructive"
        field={{
          label: "Ban reason",
          placeholder: "Explain why this player is being banned",
          required: true,
        }}
        onConfirm={(value) => {
          if (!banTarget || !value?.trim()) {
            return;
          }

          banMutation.mutate({
            userId: banTarget.id,
            reason: value.trim(),
          });
        }}
        isPending={banMutation.isPending}
      />

      <ConfirmActionDialog
        open={Boolean(unbanTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setUnbanTarget(null);
          }
        }}
        title="Unban player"
        description={
          unbanTarget
            ? `Restore access for ${unbanTarget.name}${
                unbanTarget.reason
                  ? ` (previously banned: ${unbanTarget.reason})`
                  : ""
              }.`
            : "Unban this player."
        }
        confirmLabel="Unban player"
        onConfirm={() => {
          if (!unbanTarget) {
            return;
          }

          unbanMutation.mutate({ userId: unbanTarget.id });
        }}
        isPending={unbanMutation.isPending}
      />

      <ConfirmActionDialog
        open={Boolean(revokeGrantTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setRevokeGrantTarget(null);
          }
        }}
        title={
          revokeGrantTarget?.feature === "autoBingo"
            ? "Revoke Auto Bingo access"
            : "Revoke Auto Mark access"
        }
        description={
          revokeGrantTarget
            ? `Remove ${
                revokeGrantTarget.feature === "autoBingo"
                  ? "Auto Bingo"
                  : "Auto Mark"
              } access for ${revokeGrantTarget.name}. Their preference will be turned off and the feature will disappear from the app until granted again.`
            : "Revoke this feature grant."
        }
        confirmLabel="Revoke access"
        confirmVariant="destructive"
        onConfirm={() => {
          if (!revokeGrantTarget || featureGrantMutation.isPending) {
            return;
          }

          featureGrantMutation.mutate({
            userId: revokeGrantTarget.id,
            payload:
              revokeGrantTarget.feature === "autoBingo"
                ? { autoBingoGranted: false }
                : { autoMarkGranted: false },
          });
        }}
        isPending={featureGrantMutation.isPending}
      />

      <ConfirmActionDialog
        open={bulkConfirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            setBulkConfirmOpen(false);
            setBulkPreviewCount(null);
            setBulkOperationId(null);
          }
        }}
        title="Confirm bulk automation update"
        description={
          bulkPreviewCount == null
            ? "Previewing target players…"
            : `Apply this update to ${bulkPreviewCount.toLocaleString()} player${
                bulkPreviewCount === 1 ? "" : "s"
              } (${
                bulkTargetMode === "selected"
                  ? "selected IDs"
                  : "all filtered accounts"
              }). Auto Mark: ${bulkAutoMark.replace("_", " ")}; Auto Bingo: ${bulkAutoBingo.replace(
                "_",
                " ",
              )}. Revokes clear player preferences. Grants leave preferences OFF.`
        }
        confirmLabel={
          bulkFeatureGrantMutation.isPending
            ? "Updating…"
            : "Apply bulk update"
        }
        confirmVariant="destructive"
        onConfirm={() => {
          const patch = buildBulkPatch(bulkAutoMark, bulkAutoBingo);
          if (
            !patch ||
            !bulkOperationId ||
            bulkFeatureGrantMutation.isPending ||
            bulkPreviewCount == null
          ) {
            return;
          }
          bulkFeatureGrantMutation.mutate({
            operationId: bulkOperationId,
            patch,
          });
        }}
        isPending={bulkFeatureGrantMutation.isPending || bulkPreviewPending}
      />

      <PlayerSendFeedbackDialog
        userId={feedbackTarget?.id ?? null}
        playerName={feedbackTarget?.name}
        open={Boolean(feedbackTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setFeedbackTarget(null);
          }
        }}
      />
      <PlayerGameHistoryDialog
        userId={selectedUserId}
        playerName={userDetailQuery.data?.fullName}
        open={gameHistoryOpen && Boolean(selectedUserId)}
        onOpenChange={setGameHistoryOpen}
      />
      <PlayerTransactionHistoryDialog
        userId={selectedUserId}
        playerName={userDetailQuery.data?.fullName}
        open={transactionHistoryOpen && Boolean(selectedUserId)}
        onOpenChange={setTransactionHistoryOpen}
      />
    </div>
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
