"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Smartphone } from "lucide-react";

import {
  getAdminAppVersionConfig,
  updateAdminAppVersionConfig,
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

const appVersionConfigQueryKey = ["admin", "app-version-config"] as const;

export function AppVersionConfigManagement() {
  const [releaseNotes, setReleaseNotes] = useState("");

  const configQuery = useQuery({
    queryKey: appVersionConfigQueryKey,
    queryFn: getAdminAppVersionConfig,
  });

  useEffect(() => {
    if (configQuery.data) {
      setReleaseNotes(configQuery.data.releaseNotes);
    }
  }, [configQuery.data]);

  const saveMutation = useAdminMutation({
    mutationFn: () =>
      updateAdminAppVersionConfig({
        releaseNotes: releaseNotes.trim(),
      }),
    invalidateQueryKeys: [appVersionConfigQueryKey],
    successMessage: "What's new notes saved.",
    errorMessage: "What's new notes could not be saved.",
  });

  const isDirty =
    configQuery.data != null &&
    configQuery.data.releaseNotes !== releaseNotes.trim();

  if (configQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading app update What's new…
      </div>
    );
  }

  if (configQuery.isError) {
    return (
      <AdminErrorState
        title="Could not load What's new settings"
        description={getApiErrorMessage(
          configQuery.error,
          "Something went wrong while loading What's new settings.",
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
                <Smartphone className="size-5" />
                App update — What&apos;s new
              </CardTitle>
              <CardDescription>
                Bullets shown on the player app update card. One line per
                bullet. Version / force / APK URL stay on server env.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!isDirty || saveMutation.isPending}
                onClick={() => {
                  if (configQuery.data) {
                    setReleaseNotes(configQuery.data.releaseNotes);
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
          <div className="space-y-2">
            <Label htmlFor="app-version-release-notes">What&apos;s new</Label>
            <textarea
              id="app-version-release-notes"
              rows={8}
              value={releaseNotes}
              onChange={(event) => setReleaseNotes(event.target.value)}
              placeholder={"Bug fixes\nFaster gameplay\nNew features"}
              className="flex min-h-[160px] w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to hide the What&apos;s new section on the update
              card.
            </p>
          </div>

          {configQuery.data?.updatedAt ? (
            <p className="text-xs text-muted-foreground">
              Last updated {formatDateTime(configQuery.data.updatedAt)}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
