"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gift, Loader2, Plus, Trash2 } from "lucide-react";

import {
  getRegistrationCashbackConfig,
  updateRegistrationCashbackConfig,
} from "@/lib/api/admin";
import type { RegistrationCashbackTier } from "@/lib/api/types";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const queryKey = ["admin", "registration-cashback-config"] as const;

function defaultTiers(): RegistrationCashbackTier[] {
  return [
    { minCartelasInSession: 50, rewardEtb: "10" },
    { minCartelasInSession: 70, rewardEtb: "20" },
  ];
}

export function RegistrationCashbackConfigManagement() {
  const [enabled, setEnabled] = useState(false);
  const [tiers, setTiers] = useState<RegistrationCashbackTier[]>(defaultTiers);

  const configQuery = useQuery({
    queryKey,
    queryFn: getRegistrationCashbackConfig,
  });

  useEffect(() => {
    if (configQuery.data) {
      setEnabled(configQuery.data.enabled);
      setTiers(
        configQuery.data.tiers.length > 0
          ? configQuery.data.tiers
          : defaultTiers(),
      );
    }
  }, [configQuery.data]);

  const saveMutation = useAdminMutation({
    mutationFn: () =>
      updateRegistrationCashbackConfig({
        enabled,
        tiers: tiers.map((tier) => ({
          minCartelasInSession: tier.minCartelasInSession,
          rewardEtb: tier.rewardEtb.trim(),
        })),
      }),
    invalidateQueryKeys: [queryKey],
    successMessage: "Cartela cashback settings saved.",
    errorMessage: "Cartela cashback settings could not be saved.",
  });

  const isDirty =
    configQuery.data != null &&
    (configQuery.data.enabled !== enabled ||
      JSON.stringify(configQuery.data.tiers) !== JSON.stringify(tiers));

  const updateTier = (
    index: number,
    patch: Partial<RegistrationCashbackTier>,
  ) => {
    setTiers((current) =>
      current.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)),
    );
  };

  if (configQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading cartela cashback settings…
      </div>
    );
  }

  if (configQuery.isError) {
    return (
      <AdminErrorState
        title="Could not load cartela cashback settings"
        description={getApiErrorMessage(
          configQuery.error,
          "Something went wrong while loading settings.",
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
              <Gift className="size-5" />
              Session cartela cashback
            </CardTitle>
            <CardDescription>
              Pays ETB when a player registers enough wallet-paid cartelas in
              one Normal, Big GOTD, or Chain game before play starts. Example:
              50 cartelas → 10 ETB, 70 cartelas → 20 ETB (best tier wins).
              Bonus and Big Game are excluded.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!isDirty || saveMutation.isPending}
              onClick={() => {
                if (configQuery.data) {
                  setEnabled(configQuery.data.enabled);
                  setTiers(configQuery.data.tiers);
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
      <CardContent className="space-y-6 pt-6">
        <div className="flex items-start gap-3">
          <input
            id="registration-cashback-enabled"
            type="checkbox"
            className="mt-1 size-4 rounded border-input"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          <div className="space-y-1">
            <Label htmlFor="registration-cashback-enabled" className="cursor-pointer">
              Enable cartela cashback
            </Label>
            <p className="text-sm text-muted-foreground">
              When off, accrual and payouts are skipped until you turn this on
              again.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Label>Tiers (per game session)</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setTiers((current) => [
                  ...current,
                  {
                    minCartelasInSession:
                      (current[current.length - 1]?.minCartelasInSession ??
                        0) + 10,
                    rewardEtb: "0",
                  },
                ])
              }
            >
              <Plus className="mr-1 size-4" />
              Add tier
            </Button>
          </div>
          <div className="space-y-2">
            {tiers.map((tier, index) => (
              <div
                key={`tier-${index}`}
                className="grid gap-3 rounded-lg border border-border/70 p-3 sm:grid-cols-[1fr_1fr_auto]"
              >
                <div className="space-y-1">
                  <Label htmlFor={`tier-min-${index}`}>Min cartelas</Label>
                  <Input
                    id={`tier-min-${index}`}
                    type="number"
                    min={1}
                    value={tier.minCartelasInSession}
                    onChange={(event) =>
                      updateTier(index, {
                        minCartelasInSession: Number(event.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`tier-reward-${index}`}>Reward (ETB)</Label>
                  <Input
                    id={`tier-reward-${index}`}
                    value={tier.rewardEtb}
                    onChange={(event) =>
                      updateTier(index, { rewardEtb: event.target.value })
                    }
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={tiers.length <= 1}
                    aria-label="Remove tier"
                    onClick={() =>
                      setTiers((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {configQuery.data?.updatedAt ? (
          <p className="text-xs text-muted-foreground">
            Last updated {formatDateTime(configQuery.data.updatedAt)}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
