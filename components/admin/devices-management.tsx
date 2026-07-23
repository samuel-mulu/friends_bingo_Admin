"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Smartphone } from "lucide-react";

import { getAdminDevices } from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/formatters";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { AdminTableSkeleton } from "@/components/admin/admin-table-skeleton";
import {
  AdminEmptyState,
  AdminErrorState,
} from "@/components/admin/admin-table-state";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

export function DevicesManagement() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const devicesQuery = useQuery({
    queryKey: [
      "admin",
      "devices",
      page,
      debouncedSearch,
      duplicatesOnly,
    ] as const,
    queryFn: () =>
      getAdminDevices(page, pageSize, {
        search: debouncedSearch || undefined,
        duplicatesOnly,
      }),
  });

  const summary = devicesQuery.data?.summary;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-3 border-b border-border/60">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="size-5" />
                Device IDs
              </CardTitle>
              <CardDescription>
                Device IDs linked to player phone numbers.
              </CardDescription>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="relative w-full sm:w-[280px]">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search device, phone, or name"
                  className="pl-9"
                />
              </div>
              <Select
                value={duplicatesOnly ? "duplicates" : "all"}
                onValueChange={(value) => {
                  setDuplicatesOnly(value === "duplicates");
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter devices" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All devices</SelectItem>
                  <SelectItem value="duplicates">Duplicates only</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex flex-wrap gap-2 text-sm">
                <div className="rounded-xl bg-muted/50 px-3 py-2">
                  <div className="font-medium text-foreground">
                    Total: {(summary?.totalDevices ?? 0).toLocaleString()}
                  </div>
                </div>
                <div
                  className={`rounded-xl px-3 py-2 ${
                    (summary?.duplicateDevices ?? 0) > 0
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted/50 text-foreground"
                  }`}
                >
                  <div className="font-medium">
                    Duplicates:{" "}
                    {(summary?.duplicateDevices ?? 0).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-0 pt-0">
          {devicesQuery.isLoading ? (
            <AdminTableSkeleton columns={6} />
          ) : devicesQuery.isError ? (
            <AdminErrorState
              title="Could not load device IDs"
              description={getApiErrorMessage(
                devicesQuery.error,
                "Please try refreshing the device list.",
              )}
              onRetry={() => devicesQuery.refetch()}
            />
          ) : !devicesQuery.data || devicesQuery.data.items.length === 0 ? (
            <AdminEmptyState
              title={
                duplicatesOnly ? "No duplicate devices" : "No device IDs found"
              }
              description={
                debouncedSearch
                  ? "No devices match this search."
                  : duplicatesOnly
                    ? "No install is currently linked to more than one account."
                    : "Device IDs appear after players register or log in."
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table className="min-w-[960px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">#</TableHead>
                      <TableHead className="min-w-[220px]">Device ID</TableHead>
                      <TableHead className="w-24 text-right">
                        Accounts
                      </TableHead>
                      <TableHead className="min-w-[180px]">
                        Phone numbers
                      </TableHead>
                      <TableHead className="min-w-[160px]">
                        Welcome bonus
                      </TableHead>
                      <TableHead className="min-w-[160px] whitespace-nowrap">
                        Last seen
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {devicesQuery.data.items.map((device, index) => (
                      <TableRow key={device.deviceId}>
                        <TableCell className="align-top tabular-nums text-muted-foreground">
                          {(page - 1) * pageSize + index + 1}
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="space-y-2">
                            <code className="block break-all text-xs">
                              {device.deviceId}
                            </code>
                            {device.isDuplicate ? (
                              <Badge variant="destructive">Duplicate</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="align-top text-right font-medium tabular-nums">
                          {device.accountCount}
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="space-y-3">
                            {device.accounts.map((account) => (
                              <div
                                key={account.userId}
                                className="space-y-1"
                              >
                                <div className="font-medium">
                                  {account.phoneNumber}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {account.fullName}
                                </div>
                                <AdminStatusBadge status={account.status} />
                              </div>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          {device.welcomeBonus.granted ? (
                            <div className="space-y-1 text-sm">
                              <Badge variant="outline">
                                {device.welcomeBonus.bonusAmount ?? 0} cartelas
                              </Badge>
                              <div className="text-muted-foreground">
                                {device.welcomeBonus.phoneNumber}
                              </div>
                              {device.welcomeBonus.grantedAt ? (
                                <div className="text-xs text-muted-foreground">
                                  {formatDateTime(
                                    device.welcomeBonus.grantedAt,
                                  )}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              Not granted
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="align-top whitespace-nowrap text-sm">
                          {device.lastSeenAt
                            ? formatDateTime(device.lastSeenAt)
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <AdminPagination
                pagination={devicesQuery.data.pagination}
                onPageChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
