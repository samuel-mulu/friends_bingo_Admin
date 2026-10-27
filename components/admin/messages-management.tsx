"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BellRing, Trash2 } from "lucide-react";

import {
  createAdminBroadcast,
  deleteAdminBroadcast,
  getAdminBroadcasts,
  remindAdminBroadcast,
} from "@/lib/api/admin";
import type { AdminBroadcast, AdminBroadcastCategory } from "@/lib/api/types";
import { formatDateTime } from "@/lib/formatters";
import { ConfirmActionDialog } from "@/components/admin/confirm-action-dialog";
import {
  AdminEmptyState,
  AdminErrorState,
} from "@/components/admin/admin-table-state";
import { useAdminMutation } from "@/lib/admin/use-admin-mutation";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const broadcastsQueryKey = ["admin", "broadcasts"] as const;

const categoryOptions: Array<{
  value: AdminBroadcastCategory;
  label: string;
  description: string;
}> = [
  {
    value: "DISMISSIBLE",
    label: "Dismissible",
    description: "Players can remove it from their inbox.",
  },
  {
    value: "PERSISTENT",
    label: "Always visible",
    description: "Stays in the inbox and cannot be dismissed.",
  },
  {
    value: "FORCED",
    label: "Forced modal",
    description:
      "Blocks the app until you delete it, or until the player closes it when allowed below.",
  },
];

function categoryLabel(category: AdminBroadcastCategory) {
  return categoryOptions.find((option) => option.value === category)?.label ?? category;
}

export function MessagesManagement() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<AdminBroadcastCategory>("DISMISSIBLE");
  const [playerCanDismiss, setPlayerCanDismiss] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminBroadcast | null>(null);
  const [pendingForcedReplace, setPendingForcedReplace] = useState(false);

  const broadcastsQuery = useQuery({
    queryKey: broadcastsQueryKey,
    queryFn: getAdminBroadcasts,
  });

  const createMutation = useAdminMutation({
    mutationFn: createAdminBroadcast,
    successMessage: "Broadcast sent to all players.",
    errorMessage: "The broadcast could not be sent.",
    invalidateQueryKeys: [broadcastsQueryKey],
    onSuccess: () => {
      setTitle("");
      setBody("");
      setCategory("DISMISSIBLE");
      setPlayerCanDismiss(false);
      setPendingForcedReplace(false);
    },
  });

  const remindMutation = useAdminMutation({
    mutationFn: (broadcastId: string) => remindAdminBroadcast(broadcastId),
    successMessage: "Reminder sent to all players.",
    errorMessage: "The reminder could not be sent.",
    invalidateQueryKeys: [broadcastsQueryKey],
  });

  const deleteMutation = useAdminMutation({
    mutationFn: (broadcastId: string) => deleteAdminBroadcast(broadcastId),
    successMessage: "Broadcast deleted.",
    errorMessage: "The broadcast could not be deleted.",
    invalidateQueryKeys: [broadcastsQueryKey],
    onSuccess: () => {
      setDeleteTarget(null);
    },
  });

  const selectedCategory = useMemo(
    () => categoryOptions.find((option) => option.value === category),
    [category],
  );

  const canSubmit = useMemo(() => {
    return title.trim().length > 0 && body.trim().length > 0;
  }, [body, title]);

  const submitBroadcast = () => {
    createMutation.mutate({
      title: title.trim(),
      body: body.trim(),
      category,
      ...(category === "FORCED"
        ? { playerCanDismiss }
        : { playerCanDismiss: undefined }),
    });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || createMutation.isPending) {
      return;
    }

    const hasActiveForced = (broadcastsQuery.data ?? []).some(
      (item) => item.category === "FORCED",
    );
    if (category === "FORCED" && hasActiveForced) {
      setPendingForcedReplace(true);
      return;
    }

    submitBroadcast();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>New broadcast</CardTitle>
          <CardDescription>
            Choose the message type before sending. Forced messages replace any
            previous forced message automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="broadcast-category">Message type</Label>
              <Select
                value={category}
                onValueChange={(value) => {
                  const next = value as AdminBroadcastCategory;
                  setCategory(next);
                  if (next !== "FORCED") {
                    setPlayerCanDismiss(false);
                  }
                }}
              >
                <SelectTrigger id="broadcast-category">
                  <SelectValue placeholder="Select message type" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCategory ? (
                <p className="text-sm text-muted-foreground">
                  {selectedCategory.description}
                </p>
              ) : null}
            </div>
            {category === "FORCED" ? (
              <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/30 p-3">
                <input
                  id="broadcast-player-can-dismiss"
                  type="checkbox"
                  className="mt-1 size-4 rounded border-input"
                  checked={playerCanDismiss}
                  onChange={(event) =>
                    setPlayerCanDismiss(event.target.checked)
                  }
                />
                <div className="space-y-1">
                  <Label
                    htmlFor="broadcast-player-can-dismiss"
                    className="cursor-pointer"
                  >
                    Allow players to close
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    When off, only deleting this message in admin removes it for
                    everyone. When on, each player can close it for themselves.
                  </p>
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="broadcast-title">Title</Label>
              <Input
                id="broadcast-title"
                value={title}
                maxLength={200}
                placeholder={
                  category === "FORCED"
                    ? "Maintenance starting soon"
                    : "Maintenance tonight"
                }
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="broadcast-body">Message</Label>
              <textarea
                id="broadcast-body"
                value={body}
                maxLength={5000}
                rows={5}
                placeholder="Write the announcement players should see."
                onChange={(event) => setBody(event.target.value)}
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <Button
              type="submit"
              disabled={!canSubmit || createMutation.isPending}
            >
              {createMutation.isPending ? "Sending..." : "Send broadcast"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sent messages</CardTitle>
          <CardDescription>
            Use the bell on dismissible messages to show them again to everyone
            who closed them. Deleting removes a message for all players;
            deleting a forced message unblocks players who could not close it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {broadcastsQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-24 animate-pulse rounded-xl bg-muted/60"
                />
              ))}
            </div>
          ) : broadcastsQuery.isError ? (
            <AdminErrorState
              title="Could not load broadcasts"
              description="Try refreshing the page."
              onRetry={() => {
                void broadcastsQuery.refetch();
              }}
            />
          ) : (broadcastsQuery.data?.length ?? 0) === 0 ? (
            <AdminEmptyState
              title="No broadcasts yet"
              description="Post your first announcement using the form above."
            />
          ) : (
            broadcastsQuery.data?.map((broadcast) => (
              <div
                key={broadcast.id}
                className="rounded-xl border border-border/70 bg-card p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-2">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold">
                          {broadcast.title}
                        </h3>
                        <Badge variant="secondary">
                          {categoryLabel(broadcast.category)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatDateTime(broadcast.createdAt)}
                      </p>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-6">
                      {broadcast.body}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {broadcast.category === "DISMISSIBLE" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={`Remind ${broadcast.title}`}
                        disabled={
                          remindMutation.isPending || deleteMutation.isPending
                        }
                        onClick={() => remindMutation.mutate(broadcast.id)}
                      >
                        <BellRing className="h-4 w-4" />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Delete ${broadcast.title}`}
                      disabled={
                        deleteMutation.isPending || remindMutation.isPending
                      }
                      onClick={() => setDeleteTarget(broadcast)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <ConfirmActionDialog
        open={pendingForcedReplace}
        title="Replace forced message?"
        description="Sending this forced message will remove the current one for all players and show this notice instead."
        confirmLabel="Send forced message"
        isPending={createMutation.isPending}
        onOpenChange={(open) => {
          if (!open) {
            setPendingForcedReplace(false);
          }
        }}
        onConfirm={() => {
          submitBroadcast();
        }}
      />

      <ConfirmActionDialog
        open={deleteTarget != null}
        title="Delete broadcast?"
        description={
          deleteTarget?.category === "FORCED"
            ? "Players will be able to use the app again immediately after this forced message is removed."
            : "This removes the message for every player immediately."
        }
        confirmLabel="Delete"
        confirmVariant="destructive"
        isPending={deleteMutation.isPending}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        onConfirm={() => {
          if (!deleteTarget) {
            return;
          }

          deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}
