"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquareReply } from "lucide-react";

import {
  getAdminSupportMessage,
  getAdminSupportMessages,
  replyToSupportMessage,
} from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { PlayerSupportStatus } from "@/lib/api/types";
import { formatDateTime } from "@/lib/formatters";
import { useAdminMutation } from "@/lib/admin/use-admin-mutation";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { AdminTableSkeleton } from "@/components/admin/admin-table-skeleton";
import {
  AdminEmptyState,
  AdminErrorState,
} from "@/components/admin/admin-table-state";
import { LoadingButton } from "@/components/admin/loading-button";
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
import { Label } from "@/components/ui/label";
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
type StatusFilter = PlayerSupportStatus | "ALL";

const supportQueryKey = (page: number, status: StatusFilter) =>
  ["admin", "support", page, status] as const;
const supportDetailQueryKey = (id: string) =>
  ["admin", "support", "detail", id] as const;

const statusFilters: Array<{ value: StatusFilter; label: string }> = [
  { value: "OPEN", label: "Open" },
  { value: "REPLIED", label: "Replied" },
  { value: "CLOSED", label: "Closed" },
  { value: "ALL", label: "All" },
];

function previewMessage(message: string) {
  return message.length > 80 ? `${message.slice(0, 80)}...` : message;
}

type FeedbackReplyPanelProps = {
  messageId: string;
  adminReply: string | null;
  isReplyPending: boolean;
  onSendReply: (adminReply: string) => void;
  onClose: () => void;
};

function FeedbackReplyPanel({
  messageId,
  adminReply,
  isReplyPending,
  onSendReply,
  onClose,
}: FeedbackReplyPanelProps) {
  const [replyDraft, setReplyDraft] = useState(adminReply ?? "");

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`admin-reply-${messageId}`}>Admin reply</Label>
        <textarea
          id={`admin-reply-${messageId}`}
          rows={5}
          value={replyDraft}
          onChange={(event) => setReplyDraft(event.target.value)}
          placeholder="Write a helpful response for the player."
          className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <LoadingButton
          isLoading={isReplyPending}
          disabled={!replyDraft.trim()}
          onClick={() => onSendReply(replyDraft.trim())}
        >
          <MessageSquareReply className="size-4" />
          Send reply
        </LoadingButton>
        <Button
          variant="outline"
          disabled={isReplyPending}
          onClick={onClose}
        >
          Close
        </Button>
      </div>
    </>
  );
}

export function FeedbackManagement() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("OPEN");
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null,
  );

  const supportQuery = useQuery({
    queryKey: supportQueryKey(page, statusFilter),
    queryFn: () =>
      getAdminSupportMessages(
        page,
        pageSize,
        statusFilter === "ALL" ? undefined : statusFilter,
      ),
  });

  const detailQuery = useQuery({
    queryKey: selectedMessageId
      ? supportDetailQueryKey(selectedMessageId)
      : ["admin", "support", "detail"],
    queryFn: () => getAdminSupportMessage(selectedMessageId as string),
    enabled: Boolean(selectedMessageId),
  });

  const replyMutation = useAdminMutation({
    mutationFn: (payload: {
      messageId: string;
      adminReply?: string;
      status?: PlayerSupportStatus;
    }) =>
      replyToSupportMessage(payload.messageId, {
        adminReply: payload.adminReply,
        status: payload.status,
      }),
    successMessage: "Support message updated.",
    errorMessage: "The support message could not be updated.",
    invalidateQueryKeys: [["admin", "support"]],
  });

  const selectedMessage = detailQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Feedback"
        description="Read player feedback, complaints, and advice. Reply once in-app so the player can see your response."
      />

      <Card>
        <CardHeader className="gap-3 border-b border-border/60">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <CardTitle>Player inbox</CardTitle>
              <CardDescription>
                One message per submission. Use reply for the official response.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {statusFilters.map((filter) => (
                <Button
                  key={filter.value}
                  size="sm"
                  variant={
                    statusFilter === filter.value ? "default" : "outline"
                  }
                  onClick={() => {
                    setPage(1);
                    setStatusFilter(filter.value);
                  }}
                >
                  {filter.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {supportQuery.isLoading ? (
            <AdminTableSkeleton columns={5} rows={6} />
          ) : supportQuery.isError ? (
            <AdminErrorState
              title="Could not load feedback"
              description={getApiErrorMessage(supportQuery.error)}
              onRetry={() => supportQuery.refetch()}
            />
          ) : !supportQuery.data?.items.length ? (
            <AdminEmptyState
              title="No messages in this filter"
              description="Player submissions will appear here."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supportQuery.data.items.map((message) => (
                    <TableRow
                      key={message.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedMessageId(message.id)}
                    >
                      <TableCell>{formatDateTime(message.createdAt)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{message.user.fullName}</div>
                        <div className="text-xs text-muted-foreground">
                          {message.user.phoneNumber}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{message.category}</Badge>
                      </TableCell>
                      <TableCell>
                        <AdminStatusBadge status={message.status} />
                      </TableCell>
                      <TableCell>{previewMessage(message.message)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <AdminPagination
                pagination={supportQuery.data.pagination}
                onPageChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={Boolean(selectedMessageId)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedMessageId(null);
          }
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              {selectedMessage?.user.fullName ?? "Message details"}
            </SheetTitle>
            {selectedMessage ? (
              <SheetDescription>
                {selectedMessage.user.phoneNumber} ·{" "}
                {formatDateTime(selectedMessage.createdAt)}
              </SheetDescription>
            ) : null}
          </SheetHeader>

          {detailQuery.isLoading ? (
            <div className="py-8 text-sm text-muted-foreground">Loading...</div>
          ) : detailQuery.isError || !selectedMessage ? (
            <AdminErrorState
              title="Could not load message"
              description={getApiErrorMessage(detailQuery.error)}
              onRetry={() => detailQuery.refetch()}
            />
          ) : (
            <div className="mt-6 space-y-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{selectedMessage.category}</Badge>
                  <AdminStatusBadge status={selectedMessage.status} />
                </div>
                <p className="whitespace-pre-wrap rounded-lg border p-4 text-sm">
                  {selectedMessage.message}
                </p>
              </div>

              <FeedbackReplyPanel
                key={`${selectedMessage.id}:${selectedMessage.updatedAt}`}
                messageId={selectedMessage.id}
                adminReply={selectedMessage.adminReply}
                isReplyPending={replyMutation.isPending}
                onSendReply={(adminReply) =>
                  replyMutation.mutate({
                    messageId: selectedMessage.id,
                    adminReply,
                  })
                }
                onClose={() =>
                  replyMutation.mutate({
                    messageId: selectedMessage.id,
                    status: "CLOSED",
                  })
                }
              />

              {selectedMessage.adminReply ? (
                <div className="rounded-lg bg-muted/50 p-4 text-sm">
                  <div className="mb-2 font-medium">Current reply</div>
                  <p className="whitespace-pre-wrap">
                    {selectedMessage.adminReply}
                  </p>
                  {selectedMessage.repliedAt ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Sent {formatDateTime(selectedMessage.repliedAt)}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
