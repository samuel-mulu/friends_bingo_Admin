"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquareReply, RotateCcw } from "lucide-react";

import {
  getAdminSupportMessage,
  getAdminSupportMessages,
  replyToSupportMessage,
} from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import type {
  PlayerSupportMessage,
  PlayerSupportStatus,
} from "@/lib/api/types";
import { formatDateTime } from "@/lib/formatters";
import { openFeedbackCountQueryKey } from "@/lib/admin/use-open-feedback-count";
import { useAdminMutation } from "@/lib/admin/use-admin-mutation";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { AdminTableSkeleton } from "@/components/admin/admin-table-skeleton";
import {
  AdminEmptyState,
  AdminErrorState,
} from "@/components/admin/admin-table-state";
import { LoadingButton } from "@/components/admin/loading-button";
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
import { cn } from "@/lib/utils";

const pageSize = 20;
type StatusFilter = PlayerSupportStatus | "ALL";

/** Matches Flutter app brand purple used for player chat bubbles. */
const PLAYER_BUBBLE = "#2B0A57";
const ADMIN_BUBBLE = "#F1F2F6";

const supportQueryKey = (page: number, status: StatusFilter) =>
  ["admin", "support", page, status] as const;
const supportDetailQueryKey = (id: string) =>
  ["admin", "support", "detail", id] as const;

const statusFilters: Array<{ value: StatusFilter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "REPLIED", label: "Replied" },
  { value: "CLOSED", label: "Closed" },
];

function previewMessage(message: string) {
  return message.length > 80 ? `${message.slice(0, 80)}...` : message;
}

function firstName(fullName: string) {
  const part = fullName.trim().split(/\s+/)[0];
  return part || fullName;
}

function formatBubbleTime(value: string) {
  try {
    const date = new Date(value);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

function initialsFromName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function ChatAvatar({
  label,
  variant,
}: {
  label: string;
  variant: "player" | "admin";
}) {
  return (
    <div
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-white",
        variant === "admin" ? "bg-[#2B0A57]" : "bg-[#4C2A7A]",
      )}
      aria-hidden
    >
      {label}
    </div>
  );
}

type FeedbackComposerProps = {
  messageId: string;
  adminReply: string | null;
  status: PlayerSupportStatus;
  isPending: boolean;
  onSendReply: (adminReply: string) => void;
  onCloseTicket: () => void;
  onReopenTicket: () => void;
};

function FeedbackComposer({
  messageId,
  adminReply,
  status,
  isPending,
  onSendReply,
  onCloseTicket,
  onReopenTicket,
}: FeedbackComposerProps) {
  const [replyDraft, setReplyDraft] = useState(adminReply ?? "");

  useEffect(() => {
    setReplyDraft(adminReply ?? "");
  }, [adminReply, messageId]);

  return (
    <div className="space-y-3 border-t border-border/70 bg-background pt-4">
      <label
        htmlFor={`admin-reply-${messageId}`}
        className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        Your reply
      </label>
      <textarea
        id={`admin-reply-${messageId}`}
        rows={3}
        value={replyDraft}
        onChange={(event) => setReplyDraft(event.target.value)}
        placeholder="Write a reply the player will see in the app…"
        className="flex min-h-[88px] w-full rounded-2xl border border-input bg-[#F1F2F6] px-3.5 py-3 text-sm shadow-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B0A57]/40"
      />

      <div className="flex flex-wrap gap-2">
        <LoadingButton
          isLoading={isPending}
          disabled={!replyDraft.trim()}
          onClick={() => onSendReply(replyDraft.trim())}
          className="bg-[#2B0A57] text-white hover:bg-[#3A1570]"
        >
          <MessageSquareReply className="size-4" />
          Send reply
        </LoadingButton>
        {status === "CLOSED" ? (
          <Button
            variant="outline"
            disabled={isPending}
            onClick={onReopenTicket}
          >
            <RotateCcw className="size-4" />
            Reopen ticket
          </Button>
        ) : (
          <Button
            variant="outline"
            disabled={isPending}
            onClick={onCloseTicket}
          >
            Close ticket
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Closing a ticket only changes status. The player message and your reply
        stay visible here and in the app.
      </p>
    </div>
  );
}

function ConversationThread({ message }: { message: PlayerSupportMessage }) {
  const playerLabel = firstName(message.user.fullName);

  return (
    <div className="flex min-h-[220px] flex-col gap-3 rounded-2xl bg-[#F7F6F9] p-4">
      <p className="text-center text-[11px] font-semibold text-muted-foreground">
        {message.category} · {formatDateTime(message.createdAt)} ·{" "}
        {message.status}
      </p>

      <div className="flex items-end justify-start gap-2">
        <ChatAvatar
          label={initialsFromName(message.user.fullName)}
          variant="player"
        />
        <div className="flex max-w-[82%] flex-col items-start">
          <p className="mb-0.5 px-1 text-[11px] font-bold text-muted-foreground">
            {playerLabel}
          </p>
          <div
            className="rounded-[16px] rounded-bl-sm px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-white shadow-sm"
            style={{ backgroundColor: PLAYER_BUBBLE }}
          >
            {message.message}
          </div>
          <p className="mt-0.5 px-1 text-[10px] text-muted-foreground">
            {formatBubbleTime(message.createdAt)}
          </p>
        </div>
      </div>

      {message.adminReply ? (
        <div className="flex items-end justify-end gap-2">
          <div className="flex max-w-[82%] flex-col items-end">
            <p className="mb-0.5 px-1 text-[11px] font-bold text-muted-foreground">
              Friends Bingo
            </p>
            <div
              className="rounded-[16px] rounded-br-sm px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-foreground shadow-sm"
              style={{ backgroundColor: ADMIN_BUBBLE }}
            >
              {message.adminReply}
            </div>
            <p className="mt-0.5 px-1 text-[10px] text-muted-foreground">
              {formatBubbleTime(message.repliedAt ?? message.updatedAt)}
            </p>
          </div>
          <ChatAvatar label="FB" variant="admin" />
        </div>
      ) : (
        <p className="py-2 text-center text-xs text-muted-foreground">
          No admin reply yet — player message stays above.
        </p>
      )}
    </div>
  );
}

export function FeedbackManagement() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
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
    invalidateQueryKeys: [["admin", "support"], openFeedbackCountQueryKey],
  });

  const selectedMessage = detailQuery.data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-3 border-b border-border/60">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <CardTitle>Player messages</CardTitle>
              <CardDescription>
                Chat-style inbox like the app. Player messages are never
                deleted — closed only changes status.
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
                    <TableHead>Conversation</TableHead>
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
                      <TableCell>
                        <div className="max-w-xs space-y-1">
                          <p className="text-sm">
                            {previewMessage(message.message)}
                          </p>
                          {message.adminReply ? (
                            <p className="text-xs text-muted-foreground">
                              Reply: {previewMessage(message.adminReply)}
                            </p>
                          ) : (
                            <p className="text-xs text-amber-700">
                              Awaiting reply
                            </p>
                          )}
                        </div>
                      </TableCell>
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
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        >
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>
              {selectedMessage?.user.fullName ?? "Conversation"}
            </SheetTitle>
            {selectedMessage ? (
              <SheetDescription>
                {selectedMessage.user.phoneNumber} · player message always kept
              </SheetDescription>
            ) : null}
            {selectedMessage ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge variant="outline">{selectedMessage.category}</Badge>
                <AdminStatusBadge status={selectedMessage.status} />
              </div>
            ) : null}
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {detailQuery.isLoading ? (
              <div className="py-8 text-sm text-muted-foreground">
                Loading conversation…
              </div>
            ) : detailQuery.isError || !selectedMessage ? (
              <AdminErrorState
                title="Could not load message"
                description={getApiErrorMessage(detailQuery.error)}
                onRetry={() => detailQuery.refetch()}
              />
            ) : (
              <ConversationThread message={selectedMessage} />
            )}
          </div>

          {selectedMessage && !detailQuery.isLoading && !detailQuery.isError ? (
            <div className="px-6 pb-6">
              <FeedbackComposer
                key={`${selectedMessage.id}:${selectedMessage.updatedAt}`}
                messageId={selectedMessage.id}
                adminReply={selectedMessage.adminReply}
                status={selectedMessage.status}
                isPending={replyMutation.isPending}
                onSendReply={(adminReply) =>
                  replyMutation.mutate({
                    messageId: selectedMessage.id,
                    adminReply,
                  })
                }
                onCloseTicket={() =>
                  replyMutation.mutate({
                    messageId: selectedMessage.id,
                    status: "CLOSED",
                  })
                }
                onReopenTicket={() =>
                  replyMutation.mutate({
                    messageId: selectedMessage.id,
                    status: selectedMessage.adminReply ? "REPLIED" : "OPEN",
                  })
                }
              />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
