"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  getAdminGameRules,
  getAdminUserWalletTransactions,
} from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import type {
  AdminWalletTransactionCategory,
  AdminWalletTransactionReferenceStatus,
} from "@/lib/api/types";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import {
  AdminEmptyState,
  AdminErrorState,
} from "@/components/admin/admin-table-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
const ALL_CATEGORIES = "ALL" as const;
const ALL_STATUSES = "ALL" as const;
const ALL_GAME_RULES = "ALL" as const;

type CategoryFilter = AdminWalletTransactionCategory | typeof ALL_CATEGORIES;
type StatusFilter =
  | AdminWalletTransactionReferenceStatus
  | typeof ALL_STATUSES;
type GameRuleFilter = string | typeof ALL_GAME_RULES;

const transactionsQueryKey = (
  userId: string,
  page: number,
  category: CategoryFilter,
  status: StatusFilter,
  gameRuleId: GameRuleFilter,
) =>
  [
    "admin",
    "users",
    userId,
    "wallet-transactions",
    page,
    category,
    status,
    gameRuleId,
  ] as const;

function statusOptionsForCategory(
  category: CategoryFilter,
): Array<{ value: StatusFilter; label: string }> {
  const base = [{ value: ALL_STATUSES, label: "All statuses" }];

  if (category === "DEPOSIT") {
    return [
      ...base,
      { value: "PENDING", label: "Pending" },
      { value: "APPROVED", label: "Approved" },
      { value: "REJECTED", label: "Rejected" },
    ];
  }

  if (category === "WITHDRAWAL") {
    return [
      ...base,
      { value: "PENDING", label: "Pending" },
      { value: "APPROVED", label: "Approved" },
      { value: "PAID", label: "Paid" },
      { value: "REJECTED", label: "Rejected" },
    ];
  }

  if (category === ALL_CATEGORIES) {
    return [
      ...base,
      { value: "PENDING", label: "Pending" },
      { value: "APPROVED", label: "Approved" },
      { value: "PAID", label: "Paid" },
      { value: "REJECTED", label: "Rejected" },
    ];
  }

  return base;
}

function categorySupportsStatus(category: CategoryFilter) {
  return (
    category === ALL_CATEGORIES ||
    category === "DEPOSIT" ||
    category === "WITHDRAWAL"
  );
}

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
  const [categoryFilter, setCategoryFilter] =
    useState<CategoryFilter>(ALL_CATEGORIES);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(ALL_STATUSES);
  const [gameRuleFilter, setGameRuleFilter] =
    useState<GameRuleFilter>(ALL_GAME_RULES);

  const statusOptions = useMemo(
    () => statusOptionsForCategory(categoryFilter),
    [categoryFilter],
  );

  const showStatusFilter = categorySupportsStatus(categoryFilter);
  const showGameRuleFilter = categoryFilter === "GAME";

  const gameRulesQuery = useQuery({
    queryKey: ["admin", "game-rules"],
    queryFn: getAdminGameRules,
    enabled: open && showGameRuleFilter,
    staleTime: 60_000,
  });

  const gameRuleOptions = useMemo(() => {
    const rules = gameRulesQuery.data ?? [];
    return [...rules].sort((left, right) => {
      const order = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
      if (order !== 0) {
        return order;
      }
      return left.name.localeCompare(right.name);
    });
  }, [gameRulesQuery.data]);

  const activeStatusFilter = statusOptions.some(
    (option) => option.value === statusFilter,
  )
    ? statusFilter
    : ALL_STATUSES;
  const activeGameRuleFilter =
    showGameRuleFilter &&
    (gameRuleFilter === ALL_GAME_RULES ||
      !gameRulesQuery.data ||
      gameRulesQuery.data.some((rule) => rule.id === gameRuleFilter))
      ? gameRuleFilter
      : ALL_GAME_RULES;
  const hasActiveFilters =
    categoryFilter !== ALL_CATEGORIES ||
    (showStatusFilter && activeStatusFilter !== ALL_STATUSES) ||
    (showGameRuleFilter && activeGameRuleFilter !== ALL_GAME_RULES);

  const transactionsQuery = useQuery({
    queryKey: userId
      ? transactionsQueryKey(
          userId,
          page,
          categoryFilter,
          activeStatusFilter,
          activeGameRuleFilter,
        )
      : ["admin", "users", "wallet-transactions"],
    queryFn: () =>
      getAdminUserWalletTransactions(userId as string, page, pageSize, {
        category:
          categoryFilter === ALL_CATEGORIES ? undefined : categoryFilter,
        status:
          showStatusFilter && activeStatusFilter !== ALL_STATUSES
            ? activeStatusFilter
            : undefined,
        gameRuleId:
          activeGameRuleFilter !== ALL_GAME_RULES
            ? activeGameRuleFilter
            : undefined,
      }),
    enabled: open && Boolean(userId),
  });

  const resetFilters = () => {
    setCategoryFilter(ALL_CATEGORIES);
    setStatusFilter(ALL_STATUSES);
    setGameRuleFilter(ALL_GAME_RULES);
    setPage(1);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setPage(1);
          resetFilters();
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

        <div className="border-b border-border/60 px-6 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Select
              value={categoryFilter}
              onValueChange={(value) => {
                const next = value as CategoryFilter;
                setCategoryFilter(next);
                if (!categorySupportsStatus(next)) {
                  setStatusFilter(ALL_STATUSES);
                } else if (
                  !statusOptionsForCategory(next).some(
                    (option) => option.value === statusFilter,
                  )
                ) {
                  setStatusFilter(ALL_STATUSES);
                }
                if (next !== "GAME") {
                  setGameRuleFilter(ALL_GAME_RULES);
                }
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CATEGORIES}>All types</SelectItem>
                <SelectItem value="DEPOSIT">Deposits</SelectItem>
                <SelectItem value="WITHDRAWAL">Withdrawals</SelectItem>
                <SelectItem value="GAME">Game entries</SelectItem>
                <SelectItem value="PRIZE">Prizes</SelectItem>
                <SelectItem value="OTHER">Adjustments</SelectItem>
              </SelectContent>
            </Select>

            {showStatusFilter ? (
              <Select
                value={activeStatusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as StatusFilter);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {showGameRuleFilter ? (
              <Select
                value={activeGameRuleFilter}
                onValueChange={(value) => {
                  setGameRuleFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue placeholder="Game rule" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_GAME_RULES}>All game rules</SelectItem>
                  {gameRuleOptions.map((rule) => (
                    <SelectItem key={rule.id} value={rule.id}>
                      {rule.isActive === false
                        ? `${rule.name} (inactive)`
                        : rule.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {hasActiveFilters ? (
              <Button type="button" variant="ghost" onClick={resetFilters}>
                Reset filters
              </Button>
            ) : null}
          </div>
        </div>

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
              description={
                hasActiveFilters
                  ? "No ledger entries match these filters."
                  : "This player has no wallet ledger entries yet."
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
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
                      <TableCell>
                        {tx.referenceStatus ? (
                          <AdminStatusBadge status={tx.referenceStatus} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
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
