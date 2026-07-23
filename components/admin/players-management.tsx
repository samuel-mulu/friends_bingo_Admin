"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  Copy,
  Eye,
  History,
  ReceiptText,
  Search,
  Smartphone,
  Wallet,
} from "lucide-react";
import Link from "next/link";

import { getAdminUserById, getAdminUsers } from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import { adminToast } from "@/lib/admin/admin-toast";
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
import { PlayerGameHistoryDialog } from "@/components/admin/player-game-history-dialog";
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

const usersQueryKey = (
  page: number,
  role: UserRoleFilter,
  search: string,
  sortBy: SortKey,
) => ["admin", "users", page, role, search, sortBy] as const;
const userDetailQueryKey = (userId: string) =>
  ["admin", "users", userId] as const;

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

export function PlayersManagement() {
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState<UserRoleFilter>("PLAYER");
  const [sortBy, setSortBy] = useState<SortKey>("balance");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [gameHistoryOpen, setGameHistoryOpen] = useState(false);
  const [transactionHistoryOpen, setTransactionHistoryOpen] = useState(false);
  const [selectedPhoneIds, setSelectedPhoneIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setSelectedPhoneIds(new Set());
  }, [page, roleFilter, debouncedSearch, sortBy]);

  const usersQuery = useQuery({
    queryKey: usersQueryKey(page, roleFilter, debouncedSearch, sortBy),
    queryFn: () =>
      getAdminUsers(page, pageSize, {
        role: roleFilter,
        search: debouncedSearch || undefined,
        sortBy,
        sortOrder: "desc",
      }),
  });

  const userDetailQuery = useQuery({
    queryKey: selectedUserId
      ? userDetailQueryKey(selectedUserId)
      : ["admin", "users", "detail"],
    queryFn: () => getAdminUserById(selectedUserId as string),
    enabled: Boolean(selectedUserId),
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-3 border-b border-border/60">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle>Player directory</CardTitle>
              <CardDescription>
                Search by name or phone. Default sort is highest balance first.
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
        </CardHeader>

        <CardContent className="px-0 pt-0">
          {usersQuery.isLoading ? (
            <AdminTableSkeleton columns={9} />
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
                debouncedSearch
                  ? "No accounts match this search."
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
                    <TableHead className="text-right">Wallet balance</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersQuery.data.items.map((user, index) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          aria-label={`Select ${user.phoneNumber}`}
                          className="size-4 accent-primary"
                          checked={selectedPhoneIds.has(user.id)}
                          onChange={(event) =>
                            togglePhoneSelection(user.id, event.target.checked)
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
                      <TableCell className="text-right font-medium">
                        {formatCurrency(user.walletBalance)}
                      </TableCell>
                      <TableCell>{formatDateTime(user.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedUserId(user.id)}
                        >
                          <Eye className="size-4" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
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

                <div className="flex flex-wrap gap-2">
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
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

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
