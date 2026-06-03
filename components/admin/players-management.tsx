"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Wallet } from "lucide-react";

import { getAdminUserById, getAdminUsers } from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { AdminTableSkeleton } from "@/components/admin/admin-table-skeleton";
import {
  AdminEmptyState,
  AdminErrorState,
} from "@/components/admin/admin-table-state";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const pageSize = 20;
const usersQueryKey = (page: number) => ["admin", "users", page] as const;
const userDetailQueryKey = (userId: string) => ["admin", "users", userId] as const;

export function PlayersManagement() {
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: usersQueryKey(page),
    queryFn: () => getAdminUsers(page, pageSize),
  });

  const userDetailQuery = useQuery({
    queryKey: selectedUserId ? userDetailQueryKey(selectedUserId) : ["admin", "users", "detail"],
    queryFn: () => getAdminUserById(selectedUserId as string),
    enabled: Boolean(selectedUserId),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Players"
        description="Browse player accounts, review wallet balances, and open a focused profile drawer before taking any operational action."
      />

      <Card>
        <CardHeader className="gap-3 border-b border-border/60">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle>Player directory</CardTitle>
              <CardDescription>
                Admin-safe user listing with current status, role, wallet
                balance, and a drill-down view for operational support.
              </CardDescription>
            </div>
            <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
              <div className="font-medium text-foreground">
                {usersQuery.data?.pagination.totalItems.toLocaleString() ?? "0"}{" "}
                total users
              </div>
              <div className="text-muted-foreground">
                Paginated for quick admin lookup
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-0 pt-0">
          {usersQuery.isLoading ? (
            <AdminTableSkeleton columns={7} />
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
              title="No players found"
              description="Player accounts will appear here once people start registering."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
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
                  {usersQuery.data.items.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.fullName}</TableCell>
                      <TableCell>{user.phoneNumber}</TableCell>
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
          }
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-xl">
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>Player details</SheetTitle>
            <SheetDescription>
              Review the player profile, wallet summary, and basic activity
              counts without exposing any sensitive credential data.
            </SheetDescription>
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
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <DetailItem label="Role" value={userDetailQuery.data.role} />
                    <DetailItem
                      label="Status"
                      value={
                        <AdminStatusBadge status={userDetailQuery.data.status} />
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
                    <div className="flex items-center gap-2">
                      <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Wallet className="size-4" />
                      </div>
                      <div>
                        <CardTitle>Wallet summary</CardTitle>
                        <CardDescription>
                          Available and locked balances from the backend wallet
                          source of truth.
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <DetailItem
                      label="Available balance"
                      value={formatCurrency(
                        userDetailQuery.data.wallet?.balance ?? "0",
                      )}
                    />
                    <DetailItem
                      label="Locked balance"
                      value={formatCurrency(
                        userDetailQuery.data.wallet?.lockedBalance ?? "0",
                      )}
                    />
                    <DetailItem
                      label="Wallet ID"
                      value={userDetailQuery.data.wallet?.id ?? "-"}
                    />
                    <DetailItem
                      label="Wallet updated"
                      value={formatDateTime(
                        userDetailQuery.data.wallet?.updatedAt ?? null,
                      )}
                    />
                  </CardContent>
                </Card>

                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Activity snapshot</CardTitle>
                    <CardDescription>
                      A compact operational view of the player&apos;s financial
                      and game-related record counts.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <DetailItem
                      label="Deposits"
                      value={userDetailQuery.data.counts.deposits.toLocaleString()}
                    />
                    <DetailItem
                      label="Withdrawals"
                      value={userDetailQuery.data.counts.withdrawals.toLocaleString()}
                    />
                    <DetailItem
                      label="Game registrations"
                      value={userDetailQuery.data.counts.gameCartelas.toLocaleString()}
                    />
                    <DetailItem
                      label="Wallet transactions"
                      value={userDetailQuery.data.counts.transactions.toLocaleString()}
                    />
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
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
