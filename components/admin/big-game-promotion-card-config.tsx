"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Megaphone } from "lucide-react";

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

export function BigGamePromotionCardConfig() {
  const [bigGamePromotionCardEnabled, setBigGamePromotionCardEnabled] =
    useState(true);

  const configQuery = useQuery({
    queryKey: displayConfigQueryKey,
    queryFn: getAdminDisplayConfig,
  });

  useEffect(() => {
    if (configQuery.data) {
      setBigGamePromotionCardEnabled(
        configQuery.data.bigGamePromotionCardEnabled,
      );
    }
  }, [configQuery.data]);

  const saveMutation = useAdminMutation({
    mutationFn: () =>
      updateAdminDisplayConfig({ bigGamePromotionCardEnabled }),
    invalidateQueryKeys: [displayConfigQueryKey],
    successMessage: "Big Game promo card setting saved.",
    errorMessage: "Could not save Big Game promo card setting.",
  });

  const isDirty =
    configQuery.data != null &&
    configQuery.data.bigGamePromotionCardEnabled !==
      bigGamePromotionCardEnabled;

  if (configQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading promo card settings…
      </div>
    );
  }

  if (configQuery.isError) {
    return (
      <AdminErrorState
        title="Could not load promo card settings"
        description={getApiErrorMessage(
          configQuery.error,
          "Something went wrong while loading display settings.",
        )}
        onRetry={() => configQuery.refetch()}
      />
    );
  }

  return (
    <Card className="border-violet-200/60">
      <CardHeader className="gap-3 border-b border-violet-100/80 pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-violet-950">
              <Megaphone className="h-5 w-5 text-violet-600" />
              Big Game promotion
            </CardTitle>
            <CardDescription>
              Controls Big Game prompts in the mobile app: the centered card on
              Wallet and other tabs, and the thin strip at the top of the Games
              screen during a normal live round. When off, neither appears.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!isDirty || saveMutation.isPending}
              onClick={() => {
                if (configQuery.data) {
                  setBigGamePromotionCardEnabled(
                    configQuery.data.bigGamePromotionCardEnabled,
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
            <Label htmlFor="big-game-promotion-card-enabled">
              Show Big Game promotion
            </Label>
            <p className="text-sm text-muted-foreground">
              When enabled, logged-in players see Big Game prompts while an
              event is actionable (registration open, waiting, or live). When
              disabled, the overlay and Games strip are both hidden.
            </p>
            {configQuery.data?.updatedAt ? (
              <p className="text-xs text-muted-foreground">
                Last updated {formatDateTime(configQuery.data.updatedAt)}
              </p>
            ) : null}
          </div>
          <label className="flex shrink-0 items-center gap-2 text-sm font-medium">
            <input
              id="big-game-promotion-card-enabled"
              type="checkbox"
              className="size-4 rounded border-input"
              checked={bigGamePromotionCardEnabled}
              onChange={(event) =>
                setBigGamePromotionCardEnabled(event.target.checked)
              }
            />
            {bigGamePromotionCardEnabled ? "On" : "Off"}
          </label>
        </div>
      </CardContent>
    </Card>
  );
}
