"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, Loader2 } from "lucide-react";

import {
  getAdminDepositApprovalConfig,
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const depositConfigQueryKey = ["admin", "deposit-config"] as const;

const providerLabels: Record<PaymentProvider, string> = {
  TELEBIRR: "Telebirr",
  CBE: "CBE",
  AWASH: "Awash",
  BOA: "Bank of Abyssinia",
};

const modeLabels: Record<DepositApprovalMode, string> = {
  automatic: "Automatic",
  manual: "Manual",
  local: "Local (client receipt)",
};

type ProviderDraft = {
  provider: PaymentProvider;
  enabled: boolean;
  approvalMode: DepositApprovalMode;
  allowedModes: DepositApprovalMode[];
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
    allowedModes: entry.allowedModes,
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

  const isDirty = useMemo(() => {
    if (!configQuery.data?.providers) {
      return false;
    }

    const original = configToDraft(configQuery.data.providers);
    return JSON.stringify(original) !== JSON.stringify(draft);
  }, [configQuery.data?.providers, draft]);

  const updateProvider = (
    provider: PaymentProvider,
    patch: Partial<Pick<ProviderDraft, "enabled" | "approvalMode">>,
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
        Loading deposit configuration…
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
                Default is Automatic — the current live verify.et behavior. Switch
                to Manual for admin review, or Local for Telebirr client-receipt
                approval without verify.et.
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

        <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
          {draft.map((entry) => (
            <Card key={entry.provider} className="border-border/70 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {providerLabels[entry.provider]}
                </CardTitle>
                <CardDescription>
                  Last updated{" "}
                  {entry.updatedAt
                    ? formatDateTime(entry.updatedAt)
                    : "—"}
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
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
