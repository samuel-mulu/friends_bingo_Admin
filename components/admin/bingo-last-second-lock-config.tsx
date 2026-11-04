"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Lock } from "lucide-react";

import {
  getAdminDisplayConfig,
  updateAdminDisplayConfig,
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

const displayConfigQueryKey = ["admin", "display-config"] as const;

export function BingoLastSecondLockConfig() {
  const [bingoClaimLastSecondLockEnabled, setBingoClaimLastSecondLockEnabled] =
    useState(false);

  const configQuery = useQuery({
    queryKey: displayConfigQueryKey,
    queryFn: getAdminDisplayConfig,
  });

  useEffect(() => {
    if (configQuery.data) {
      setBingoClaimLastSecondLockEnabled(
        configQuery.data.bingoClaimLastSecondLockEnabled === true,
      );
    }
  }, [configQuery.data]);

  const saveMutation = useAdminMutation({
    mutationFn: () =>
      updateAdminDisplayConfig({ bingoClaimLastSecondLockEnabled }),
    invalidateQueryKeys: [displayConfigQueryKey],
    successMessage: "Last-second Bingo lock setting saved.",
    errorMessage: "Could not save the last-second Bingo lock setting.",
  });

  const isDirty =
    configQuery.data != null &&
    (configQuery.data.bingoClaimLastSecondLockEnabled === true) !==
      bingoClaimLastSecondLockEnabled;

  if (configQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading Bingo lock settings…
      </div>
    );
  }

  if (configQuery.isError) {
    return (
      <AdminErrorState
        title="Could not load Bingo lock settings"
        description={getApiErrorMessage(
          configQuery.error,
          "Something went wrong while loading display settings.",
        )}
        onRetry={() => configQuery.refetch()}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="gap-3 border-b border-border/60">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Lock className="size-5" />
              Last-second Bingo lock
            </CardTitle>
            <CardDescription>
              Optional lock on the Bingo button around each auto-called ball.
              Off by default. Chain Game still locks Bingo between rounds.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!isDirty || saveMutation.isPending}
              onClick={() => {
                if (configQuery.data) {
                  setBingoClaimLastSecondLockEnabled(
                    configQuery.data.bingoClaimLastSecondLockEnabled === true,
                  );
                }
              }}
            >
              Reset
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
      <CardContent className="pt-6">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-4">
          <div className="space-y-1">
            <Label htmlFor="bingo-last-second-lock-enabled">
              Lock Bingo for the last second
            </Label>
            <p className="text-sm text-muted-foreground">
              When on, Bingo turns off during the last second before each
              auto-called ball, while that ball is arriving, and for 1 second
              after it appears. When off, that timer lock does not run.
            </p>
            {configQuery.data?.updatedAt ? (
              <p className="text-xs text-muted-foreground">
                Last updated {formatDateTime(configQuery.data.updatedAt)}
              </p>
            ) : null}
          </div>
          <label className="flex shrink-0 items-center gap-2 text-sm font-medium">
            <input
              id="bingo-last-second-lock-enabled"
              type="checkbox"
              className="size-4 rounded border-input"
              checked={bingoClaimLastSecondLockEnabled}
              onChange={(event) =>
                setBingoClaimLastSecondLockEnabled(event.target.checked)
              }
            />
            {bingoClaimLastSecondLockEnabled ? "On" : "Off"}
          </label>
        </div>
      </CardContent>
    </Card>
  );
}
