"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BellRing, Trash2 } from "lucide-react";

import {
  createAdminBroadcast,
  deleteAdminBroadcast,
  getAdminBroadcasts,
  remindAdminBroadcast,
  setAdminBroadcastForcedLive,
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
      "Blocks the app for all players while it is on. Turn it off to hide from players without deleting.",
  },
];

function categoryLabel(category: AdminBroadcastCategory) {
  return categoryOptions.find((option) => option.value === category)?.label ?? category;
}

function isForcedLive(broadcast: AdminBroadcast) {
  return broadcast.category === "FORCED" && broadcast.forcedLive === true;
}

export function MessagesManagement() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<AdminBroadcastCategory>("DISMISSIBLE");
  const [deleteTarget, setDeleteTarget] = useState<AdminBroadcast | null>(null);
  const [pendingForcedReplace, setPendingForcedReplace] = useState(false);
  const [pendingForcedActivate, setPendingForcedActivate] =
    useState<AdminBroadcast | null>(null);

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

  const forcedLiveMutation = useAdminMutation({
    mutationFn: ({ id, live }: { id: string; live: boolean }) =>
      setAdminBroadcastForcedLive(id, live),
    successMessage: "Forced message updated.",
    errorMessage: "The forced message could not be updated.",
    invalidateQueryKeys: [broadcastsQueryKey],
    onSuccess: () => {
      setPendingForcedActivate(null);
    },
  });

  const selectedCategory = useMemo(
    () => categoryOptions.find((option) => option.value === category),
    [category],
  );

  const canSubmit = useMemo(() => {
    return title.trim().length > 0 && body.trim().length > 0;
  }, [body, title]);

  const hasLiveForced = useMemo(() => {
    return (broadcastsQuery.data ?? []).some(isForcedLive);
  }, [broadcastsQuery.data]);

  const submitBroadcast = () => {
    createMutation.mutate({
      title: title.trim(),
      body: body.trim(),
      category,
    });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || createMutation.isPending) {
      return;
    }

    if (category === "FORCED" && hasLiveForced) {
      setPendingForcedReplace(true);
      return;
    }

    submitBroadcast();
  };

  const requestForcedLiveChange = (broadcast: AdminBroadcast, live: boolean) => {
    if (broadcast.category !== "FORCED") {
      return;
    }

    if (!live) {
      forcedLiveMutation.mutate({ id: broadcast.id, live: false });
      return;
    }

    if (broadcast.forcedLive === true) {
      return;
    }

    const otherLive = (broadcastsQuery.data ?? []).find(
      (item) => isForcedLive(item) && item.id !== broadcast.id,
    );
    if (otherLive) {
      setPendingForcedActivate(broadcast);
      return;
    }

    forcedLiveMutation.mutate({ id: broadcast.id, live: true });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>New broadcast</CardTitle>
          <CardDescription>
            Choose the message type before sending. A new forced message goes live
            immediately and turns off any other live forced message.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="broadcast-category">Message type</Label>
              <Select
                value={category}
                onValueChange={(value) => {
                  setCategory(value as AdminBroadcastCategory);
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
            who closed them. For forced messages, turn off to hide from players
            without deleting; turn on again to show a fresh blocking modal.
            Delete permanently removes a message.
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
                        {broadcast.category === "FORCED" ? (
                          <Badge
                            variant={
                              broadcast.forcedLive ? "default" : "outline"
                            }
                          >
                            {broadcast.forcedLive ? "On" : "Off"}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatDateTime(broadcast.createdAt)}
                      </p>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-6">
                      {broadcast.body}
                    </p>
                    {broadcast.category === "FORCED" ? (
                      <div className="flex items-center gap-3 pt-1">
                        <Label
                          htmlFor={`forced-live-${broadcast.id}`}
                          className="text-sm font-normal text-muted-foreground"
                        >
                          Live for players
                        </Label>
                        <input
                          id={`forced-live-${broadcast.id}`}
                          type="checkbox"
                          className="size-4 rounded border-input"
                          checked={broadcast.forcedLive === true}
                          disabled={forcedLiveMutation.isPending}
                          onChange={(event) => {
                            requestForcedLiveChange(
                              broadcast,
                              event.target.checked,
                            );
                          }}
                        />
                      </div>
                    ) : null}
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
        title="Replace live forced message?"
        description="Sending this forced message will turn off the current live one for all players and show this notice instead."
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
        open={pendingForcedActivate != null}
        title="Change live forced message?"
        description="Turning this message on will turn off the current live forced message for all players and show this one instead."
        confirmLabel="Turn on"
        isPending={forcedLiveMutation.isPending}
        onOpenChange={(open) => {
          if (!open) {
            setPendingForcedActivate(null);
          }
        }}
        onConfirm={() => {
          if (!pendingForcedActivate) {
            return;
          }

          forcedLiveMutation.mutate({
            id: pendingForcedActivate.id,
            live: true,
          });
        }}
      />

      <ConfirmActionDialog
        open={deleteTarget != null}
        title="Delete broadcast?"
        description={
          deleteTarget?.category === "FORCED" && deleteTarget.forcedLive
            ? "Players will be able to use the app again immediately after this live forced message is removed."
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
