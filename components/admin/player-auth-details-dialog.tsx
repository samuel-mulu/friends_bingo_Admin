"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Smartphone } from "lucide-react";

import { getAdminUserAuthDetails } from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/formatters";
import {
  AdminEmptyState,
  AdminErrorState,
} from "@/components/admin/admin-table-state";
import { AdminTableSkeleton } from "@/components/admin/admin-table-skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const authDetailsQueryKey = (userId: string) =>
  ["admin", "users", userId, "auth-details"] as const;

export function PlayerAuthDetailsDialog({
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
  const authQuery = useQuery({
    queryKey: userId
      ? authDetailsQueryKey(userId)
      : ["admin", "users", "auth-details"],
    queryFn: () => getAdminUserAuthDetails(userId as string),
    enabled: open && Boolean(userId),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4" />
            Authentication
          </DialogTitle>
          <DialogDescription>
            {playerName
              ? `Login and session activity for ${playerName}.`
              : "Login and session activity for this player."}
          </DialogDescription>
        </DialogHeader>

        {authQuery.isLoading ? (
          <AdminTableSkeleton columns={1} rows={4} />
        ) : authQuery.isError ? (
          <AdminErrorState
            title="Could not load authentication details"
            description={getApiErrorMessage(
              authQuery.error,
              "Please try again.",
            )}
            onRetry={() => authQuery.refetch()}
          />
        ) : !authQuery.data ? (
          <AdminEmptyState
            title="No authentication data"
            description="Open a player to review login and last seen details."
          />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailItem
                label="Logged in"
                value={
                  <Badge
                    variant={
                      authQuery.data.isLoggedIn ? "default" : "outline"
                    }
                  >
                    {authQuery.data.isLoggedIn ? "Yes" : "No"}
                  </Badge>
                }
              />
              <DetailItem
                label="Active sessions"
                value={String(authQuery.data.activeSessionCount)}
              />
              <DetailItem
                label="Last login"
                value={
                  authQuery.data.lastLoginAt
                    ? formatDateTime(authQuery.data.lastLoginAt)
                    : "Never recorded"
                }
              />
              <DetailItem
                label="Last seen"
                value={
                  authQuery.data.lastSeenAt
                    ? formatDateTime(authQuery.data.lastSeenAt)
                    : "—"
                }
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Active devices
              </p>
              {authQuery.data.sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No active sessions right now.
                </p>
              ) : (
                <ul className="space-y-2">
                  {authQuery.data.sessions.map((session) => (
                    <li
                      key={session.id}
                      className="rounded-lg border border-border/70 p-3"
                    >
                      <div className="flex items-start gap-2">
                        <Smartphone className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 space-y-1">
                          <p className="truncate text-sm font-medium">
                            {session.deviceLabel?.trim() ||
                              session.platform?.trim() ||
                              "Unknown device"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Last used {formatDateTime(session.lastUsedAt)}
                          </p>
                          {session.deviceId ? (
                            <p className="truncate font-mono text-[11px] text-muted-foreground">
                              {session.deviceId}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
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
    <div className="space-y-1 rounded-lg border border-border/70 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}
