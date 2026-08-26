"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BellRing, Loader2 } from "lucide-react";

import {
  getAdminNotificationConfig,
  updateAdminNotificationConfig,
} from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/formatters";
import { useAdminMutation } from "@/lib/admin/use-admin-mutation";
import { LoadingButton } from "@/components/admin/loading-button";
import { AdminErrorState } from "@/components/admin/admin-table-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";

const notificationConfigQueryKey = ["admin", "notification-config"] as const;

export function NotificationConfigManagement() {
  const [pushNotificationsEnabled, setPushNotificationsEnabled] =
    useState(true);

  const configQuery = useQuery({
    queryKey: notificationConfigQueryKey,
    queryFn: getAdminNotificationConfig,
  });

  useEffect(() => {
    if (configQuery.data) {
      setPushNotificationsEnabled(configQuery.data.pushNotificationsEnabled);
    }
  }, [configQuery.data]);

  const saveMutation = useAdminMutation({
    mutationFn: () =>
      updateAdminNotificationConfig({ pushNotificationsEnabled }),
    invalidateQueryKeys: [notificationConfigQueryKey],
    successMessage: "Notification settings saved.",
    errorMessage: "Notification settings could not be saved.",
  });

  const isDirty =
    configQuery.data != null &&
    configQuery.data.pushNotificationsEnabled !== pushNotificationsEnabled;

  if (configQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading notification settings…
      </div>
    );
  }

  if (configQuery.isError) {
    return (
      <AdminErrorState
        title="Could not load notification settings"
        description={getApiErrorMessage(
          configQuery.error,
          "Something went wrong while loading notification settings.",
        )}
        onRetry={() => configQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-3 border-b border-border/60">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <BellRing className="size-5" />
                Push notifications
              </CardTitle>
              <CardDescription>
                Global server kill switch for Firebase push notifications,
                including game events, winner announcements, deposits, and
                withdrawals.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!isDirty || saveMutation.isPending}
                onClick={() => {
                  if (configQuery.data) {
                    setPushNotificationsEnabled(
                      configQuery.data.pushNotificationsEnabled,
                    );
                  }
                }}
              >
                Reset changes
              </Button>
              <LoadingButton
                type="button"
                disabled={!isDirty}
                isLoading={saveMutation.isPending}
                onClick={() => saveMutation.mutate(undefined)}
              >
                Save
              </LoadingButton>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 pt-6">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-4">
            <div className="space-y-1">
              <Label htmlFor="push-notifications-enabled">
                Push notifications enabled
              </Label>
              <p className="text-sm text-muted-foreground">
                When disabled, the API skips all Firebase push delivery. Player
                app notification preferences are unchanged.
              </p>
              {configQuery.data?.updatedAt ? (
                <p className="text-xs text-muted-foreground">
                  Last updated {formatDateTime(configQuery.data.updatedAt)}
                </p>
              ) : null}
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                id="push-notifications-enabled"
                type="checkbox"
                checked={pushNotificationsEnabled}
                onChange={(event) =>
                  setPushNotificationsEnabled(event.target.checked)
                }
                className="size-4 rounded border-border"
              />
              On
            </label>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
