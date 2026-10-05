"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getAdminSessionBingoAttempts } from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { AdminBingoAttempt } from "@/lib/api/types";
import { formatDateTime } from "@/lib/formatters";
import {
  AdminEmptyState,
  AdminErrorState,
} from "@/components/admin/admin-table-state";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function statusBadgeVariant(status: string) {
  switch (status) {
    case "VALID":
      return "default" as const;
    case "INVALID":
    case "FAILED":
      return "destructive" as const;
    case "CHECKING":
    case "PENDING":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

export function SessionBingoAttemptsSection({
  sessionId,
  enabled,
}: {
  sessionId: string | null;
  enabled: boolean;
}) {
  const [selected, setSelected] = useState<AdminBingoAttempt | null>(null);

  const query = useQuery({
    queryKey: ["admin", "session-bingo-attempts", sessionId],
    queryFn: () => getAdminSessionBingoAttempts(sessionId as string),
    enabled: enabled && Boolean(sessionId),
  });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Bingo Attempts</h3>
        <Badge variant="outline">
          Bingo attempts: {query.data?.attemptCount ?? 0}
        </Badge>
      </div>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading attempts…</p>
      ) : query.isError ? (
        <AdminErrorState
          title="Could not load bingo attempts"
          description={getApiErrorMessage(
            query.error,
            "Try again in a moment.",
          )}
          onRetry={() => query.refetch()}
        />
      ) : !query.data?.items.length ? (
        <AdminEmptyState
          title="No bingo attempts"
          description="No server-received bingo claims for this session yet."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Player</TableHead>
                <TableHead>Cartela</TableHead>
                <TableHead>#</TableHead>
                <TableHead>Ball</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.items.map((item) => (
                <TableRow
                  key={item.claimAttemptId}
                  className="cursor-pointer"
                  onClick={() => setSelected(item)}
                >
                  <TableCell className="whitespace-nowrap text-xs">
                    {formatDateTime(item.receivedAt)}
                  </TableCell>
                  <TableCell className="max-w-[10rem] truncate text-xs">
                    {item.user.fullName || item.user.phoneNumber}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    #{item.cartelaNumber}
                  </TableCell>
                  <TableCell className="text-xs">#{item.attemptNumber}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {item.ballAtReceipt ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(item.status)}>
                      {item.failureCode ?? item.reasonCode ?? item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">
                    {item.durationMs != null ? `${item.durationMs}ms` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bingo attempt detail</DialogTitle>
            <DialogDescription>
              Server-received attempt for cartela #
              {selected?.cartelaNumber ?? "—"}.
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">claimAttemptId</dt>
                <dd className="break-all font-mono text-xs">
                  {selected.claimAttemptId}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd>{selected.status}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">receivedAt</dt>
                <dd>{formatDateTime(selected.receivedAt)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">completedAt</dt>
                <dd>
                  {selected.completedAt
                    ? formatDateTime(selected.completedAt)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Ball at receipt</dt>
                <dd className="font-mono">{selected.ballAtReceipt ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Ball order</dt>
                <dd>{selected.receiptCalledOrder ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Called count</dt>
                <dd>{selected.calledNumbersCountAtReceipt ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Duration</dt>
                <dd>
                  {selected.durationMs != null
                    ? `${selected.durationMs}ms`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">failureCode</dt>
                <dd>{selected.failureCode ?? "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Reason</dt>
                <dd>{selected.reason ?? selected.failureMessage ?? "—"}</dd>
              </div>
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
