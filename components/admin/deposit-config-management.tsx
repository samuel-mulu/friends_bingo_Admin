"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, CreditCard, Loader2, RotateCcw, ShieldAlert } from "lucide-react";

import {
  getAdminDepositApprovalConfig,
  resetAdminTelebirrFallback,
  updateAdminDepositApprovalConfig,
} from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import type {
  DepositApprovalMode,
  DepositApprovalProviderConfig,
  PaymentProvider,
  UpdateDepositApprovalConfigPayload,
} from "@/lib/api/types";
import { formatDateTime } from "@/lib/formatters";
import { useAdminMutation } from "@/lib/admin/use-admin-mutation";
import { LoadingButton } from "@/components/admin/loading-button";
import {
  AdminEmptyState,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const depositConfigQueryKey = ["admin", "deposit-config"] as const;

const providerLabels: Record<PaymentProvider, string> = {
  TELEBIRR: "Telebirr",
  CBE: "CBE",
  AWASH: "Awash",
  BOA: "Bank of Abyssinia",
};

const modeLabels: Record<DepositApprovalMode, string> = {
  automatic: "Automatic (Verify.ET)",
  manual: "Manual",
  local: "Local (client receipt)",
  local_with_fallback: "Local with Fallback to Verify.ET",
};

type ProviderDraft = {
  provider: PaymentProvider;
  enabled: boolean;
  approvalMode: DepositApprovalMode;
  effectiveApprovalMode?: DepositApprovalMode;
  allowedModes: DepositApprovalMode[];
  fallbackThreshold: number;
  fallbackWindowMinutes: number;
  fallbackDurationMinutes: number;
  fallbackUntil: string | null;
  fallbackReason: string | null;
  isFallbackActive: boolean;
  updatedAt: string;
  updatedById: string | null;
};

function configToDraft(
  providers: DepositApprovalProviderConfig[],
): ProviderDraft[] {
  return providers.map((entry) => ({
    provider: entry.provider,
    enabled: entry.enabled,
    approvalMode: entry.approvalMode,
    effectiveApprovalMode: entry.effectiveApprovalMode,
    allowedModes: entry.allowedModes,
    fallbackThreshold: entry.fallbackThreshold ?? 2,
    fallbackWindowMinutes: entry.fallbackWindowMinutes ?? 3,
    fallbackDurationMinutes: entry.fallbackDurationMinutes ?? 30,
    fallbackUntil: entry.fallbackUntil ?? null,
    fallbackReason: entry.fallbackReason ?? null,
    isFallbackActive: Boolean(entry.isFallbackActive),
    updatedAt: entry.updatedAt,
    updatedById: entry.updatedById,
  }));
}

function draftToPayload(draft: ProviderDraft[]): UpdateDepositApprovalConfigPayload {
  return {
    providers: draft.map((entry) => ({
      provider: entry.provider,
      enabled: entry.enabled,
      approvalMode: entry.approvalMode,
      ...(entry.provider === "TELEBIRR"
        ? {
            fallbackThreshold: entry.fallbackThreshold,
            fallbackWindowMinutes: entry.fallbackWindowMinutes,
            fallbackDurationMinutes: entry.fallbackDurationMinutes,
          }
        : {}),
    })),
  };
}

export function DepositConfigManagement() {
  const configQuery = useQuery({
    queryKey: depositConfigQueryKey,
    queryFn: getAdminDepositApprovalConfig,
  });

  const [draft, setDraft] = useState<ProviderDraft[]>([]);

  useEffect(() => {
    if (configQuery.data?.providers) {
      setDraft(configToDraft(configQuery.data.providers));
    }
  }, [configQuery.data?.providers]);

  const saveMutation = useAdminMutation({
    mutationFn: () => updateAdminDepositApprovalConfig(draftToPayload(draft)),
    successMessage: "Deposit approval settings saved.",
    errorMessage: "Deposit approval settings could not be saved.",
    invalidateQueryKeys: [depositConfigQueryKey],
  });

  const resetFallbackMutation = useAdminMutation({
    mutationFn: resetAdminTelebirrFallback,
    successMessage: "Telebirr fallback circuit breaker reset back to Local.",
    errorMessage: "Could not reset Telebirr fallback.",
    invalidateQueryKeys: [depositConfigQueryKey],
  });

  const isDirty = useMemo(() => {
    if (!configQuery.data?.providers) {
      return false;
    }

    const original = configToDraft(configQuery.data.providers);
    return JSON.stringify(original) !== JSON.stringify(draft);
  }, [configQuery.data?.providers, draft]);

  const updateProvider = (
    provider: PaymentProvider,
    patch: Partial<ProviderDraft>,
  ) => {
    setDraft((current) =>
      current.map((entry) =>
        entry.provider === provider ? { ...entry, ...patch } : entry,
      ),
    );
  };

  if (configQuery.isLoading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" />
        Loading deposit configuration...
      </div>
    );
  }

  if (configQuery.isError) {
    return (
      <AdminErrorState
        title="Could not load deposit configuration"
        description={getApiErrorMessage(
          configQuery.error,
          "Please try refreshing the page.",
        )}
        onRetry={() => configQuery.refetch()}
      />
    );
  }

  if (!draft.length) {
    return (
      <AdminEmptyState
        title="No deposit providers configured"
        description="Deposit provider settings will appear here once available."
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
                <CreditCard className="size-5" />
                Deposit approval modes
              </CardTitle>
              <CardDescription>
                Configure deposit approval modes and circuit breaker thresholds for each provider.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!isDirty || saveMutation.isPending}
                onClick={() => {
                  if (configQuery.data?.providers) {
                    setDraft(configToDraft(configQuery.data.providers));
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
                Save all
              </LoadingButton>
            </div>
          </div>
        </CardHeader>

        <CardContent className="grid gap-6 pt-6 md:grid-cols-2">
          {draft.map((entry) => (
            <Card key={entry.provider} className="border-border/70 shadow-none">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {providerLabels[entry.provider]}
                  </CardTitle>
                  {entry.provider === "TELEBIRR" && entry.isFallbackActive && (
                    <Badge variant="destructive" className="flex items-center gap-1 font-mono text-xs">
                      <ShieldAlert className="size-3" /> Fallback Active
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  Last updated{" "}
                  {entry.updatedAt ? formatDateTime(entry.updatedAt) : "—"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <Label htmlFor={`${entry.provider}-enabled`}>Enabled</Label>
                    <p className="text-xs text-muted-foreground">
                      Disabled providers are hidden in the player app.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      id={`${entry.provider}-enabled`}
                      type="checkbox"
                      checked={entry.enabled}
                      onChange={(event) =>
                        updateProvider(entry.provider, {
                          enabled: event.target.checked,
                        })
                      }
                      className="size-4 rounded border-border"
                    />
                    On
                  </label>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`${entry.provider}-mode`}>Approval mode</Label>
                  <Select
                    value={entry.approvalMode}
                    onValueChange={(value) =>
                      updateProvider(entry.provider, {
                        approvalMode: value as DepositApprovalMode,
                      })
                    }
                  >
                    <SelectTrigger id={`${entry.provider}-mode`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {entry.allowedModes.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {modeLabels[mode]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {entry.provider === "TELEBIRR" && entry.approvalMode === "local_with_fallback" && (
                  <div className="rounded-lg border border-border/70 bg-muted/30 p-4 space-y-4">
                    <div className="flex items-center justify-between border-b border-border/50 pb-2">
                      <div className="text-sm font-semibold flex items-center gap-2">
                        <ShieldAlert className="size-4 text-primary" />
                        Circuit Breaker Settings
                      </div>
                      {entry.isFallbackActive ? (
                        <Badge variant="destructive" className="text-xs">
                          Tripped to Verify.ET
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300 dark:border-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="size-3" /> Healthy (Local)
                        </Badge>
                      )}
                    </div>

                    {entry.isFallbackActive && (
                      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200 space-y-2">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold">Circuit Breaker is currently ACTIVE</p>
                            <p>Operating mode temporarily redirected to Verify.ET (Automatic).</p>
                            {entry.fallbackUntil && (
                              <p className="mt-1 font-mono">
                                Auto-reverts at: {formatDateTime(entry.fallbackUntil)}
                              </p>
                            )}
                            {entry.fallbackReason && (
                              <p className="mt-0.5 text-muted-foreground text-[11px] italic">
                                Reason: {entry.fallbackReason}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="pt-1">
                          <LoadingButton
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full text-xs h-7 gap-1.5"
                            isLoading={resetFallbackMutation.isPending}
                            onClick={() => resetFallbackMutation.mutate(undefined)}
                          >
                            <RotateCcw className="size-3" />
                            Force Reset to Local Now
                          </LoadingButton>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="telebirr-threshold" className="text-xs">
                          Failure Threshold
                        </Label>
                        <Input
                          id="telebirr-threshold"
                          type="number"
                          min={1}
                          max={50}
                          value={entry.fallbackThreshold}
                          onChange={(e) =>
                            updateProvider(entry.provider, {
                              fallbackThreshold: Math.max(1, parseInt(e.target.value) || 2),
                            })
                          }
                          className="h-8 text-xs font-mono"
                        />
                        <p className="text-[10px] text-muted-foreground">Failures to trip</p>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="telebirr-window" className="text-xs">
                          Window (min)
                        </Label>
                        <Input
                          id="telebirr-window"
                          type="number"
                          min={1}
                          max={60}
                          value={entry.fallbackWindowMinutes}
                          onChange={(e) =>
                            updateProvider(entry.provider, {
                              fallbackWindowMinutes: Math.max(1, parseInt(e.target.value) || 3),
                            })
                          }
                          className="h-8 text-xs font-mono"
                        />
                        <p className="text-[10px] text-muted-foreground">Sliding window</p>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="telebirr-duration" className="text-xs">
                          Duration (min)
                        </Label>
                        <Input
                          id="telebirr-duration"
                          type="number"
                          min={1}
                          max={1440}
                          value={entry.fallbackDurationMinutes}
                          onChange={(e) =>
                            updateProvider(entry.provider, {
                              fallbackDurationMinutes: Math.max(1, parseInt(e.target.value) || 30),
                            })
                          }
                          className="h-8 text-xs font-mono"
                        />
                        <p className="text-[10px] text-muted-foreground">Fallback time</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
