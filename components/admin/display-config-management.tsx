"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Settings } from "lucide-react";

import {
  getAdminDisplayConfig,
  updateAdminDisplayConfig,
} from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/formatters";
import { useAdminMutation } from "@/lib/admin/use-admin-mutation";
import { LoadingButton } from "@/components/admin/loading-button";
import {
  AdminErrorState,
} from "@/components/admin/admin-table-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";

const displayConfigQueryKey = ["admin", "display-config"] as const;

export function DisplayConfigManagement() {
  const [showWinnerPhoneNumber, setShowWinnerPhoneNumber] = useState(false);

  const configQuery = useQuery({
    queryKey: displayConfigQueryKey,
    queryFn: getAdminDisplayConfig,
  });

  useEffect(() => {
    if (configQuery.data) {
      setShowWinnerPhoneNumber(configQuery.data.showWinnerPhoneNumber);
    }
  }, [configQuery.data]);

  const saveMutation = useAdminMutation({
    mutationFn: () =>
      updateAdminDisplayConfig({ showWinnerPhoneNumber }),
    invalidateQueryKeys: [displayConfigQueryKey],
    successMessage: "Display settings saved.",
    errorMessage: "Display settings could not be saved.",
  });

  const isDirty =
    configQuery.data != null &&
    configQuery.data.showWinnerPhoneNumber !== showWinnerPhoneNumber;

  if (configQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading display settings…
      </div>
    );
  }

  if (configQuery.isError) {
    return (
      <AdminErrorState
        title="Could not load display settings"
        description={getApiErrorMessage(
          configQuery.error,
          "Something went wrong while loading display settings.",
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
                <Settings className="size-5" />
                Display settings
              </CardTitle>
              <CardDescription>
                Control what players see on finished winner cartela screens.
                Off by default keeps current privacy behavior.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!isDirty || saveMutation.isPending}
                onClick={() => {
                  if (configQuery.data) {
                    setShowWinnerPhoneNumber(
                      configQuery.data.showWinnerPhoneNumber,
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
          <div className="flex items-start justify-between gap-4 rounded-lg border border-border/70 p-4">
            <div className="space-y-1">
              <Label htmlFor="show-winner-phone">
                Show winner phone number to players
              </Label>
              <p className="text-sm text-muted-foreground">
                When on, the winner cartela dialog shows the full local phone
                (for example 0962520885). When off, no phone is shown.
              </p>
              {configQuery.data?.updatedAt ? (
                <p className="text-xs text-muted-foreground">
                  Last updated {formatDateTime(configQuery.data.updatedAt)}
                </p>
              ) : null}
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                id="show-winner-phone"
                type="checkbox"
                checked={showWinnerPhoneNumber}
                onChange={(event) =>
                  setShowWinnerPhoneNumber(event.target.checked)
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
