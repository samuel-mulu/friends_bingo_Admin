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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WinnerPhoneDisplayMode } from "@/lib/api/types";

const displayConfigQueryKey = ["admin", "display-config"] as const;

const WINNER_PHONE_DISPLAY_OPTIONS: Array<{
  value: WinnerPhoneDisplayMode;
  label: string;
  description: string;
}> = [
  {
    value: "HIDDEN",
    label: "Hidden",
    description: "Do not show a phone number on winner cartelas.",
  },
  {
    value: "FULL",
    label: "Full local number",
    description: "Show the full local phone, for example 0962520885.",
  },
  {
    value: "MASKED",
    label: "Masked",
    description: "Show a partially masked number, for example 0962**0885.",
  },
];

export function DisplayConfigManagement() {
  const [winnerPhoneDisplayMode, setWinnerPhoneDisplayMode] =
    useState<WinnerPhoneDisplayMode>("HIDDEN");

  const configQuery = useQuery({
    queryKey: displayConfigQueryKey,
    queryFn: getAdminDisplayConfig,
  });

  useEffect(() => {
    if (configQuery.data) {
      setWinnerPhoneDisplayMode(configQuery.data.winnerPhoneDisplayMode);
    }
  }, [configQuery.data]);

  const saveMutation = useAdminMutation({
    mutationFn: () =>
      updateAdminDisplayConfig({ winnerPhoneDisplayMode }),
    invalidateQueryKeys: [displayConfigQueryKey],
    successMessage: "Display settings saved.",
    errorMessage: "Display settings could not be saved.",
  });

  const isDirty =
    configQuery.data != null &&
    configQuery.data.winnerPhoneDisplayMode !== winnerPhoneDisplayMode;

  const selectedOption = WINNER_PHONE_DISPLAY_OPTIONS.find(
    (option) => option.value === winnerPhoneDisplayMode,
  );

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
                Hidden by default keeps current privacy behavior.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!isDirty || saveMutation.isPending}
                onClick={() => {
                  if (configQuery.data) {
                    setWinnerPhoneDisplayMode(
                      configQuery.data.winnerPhoneDisplayMode,
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
          <div className="space-y-3 rounded-lg border border-border/70 p-4">
            <div className="space-y-1">
              <Label htmlFor="winner-phone-display-mode">
                Winner phone number on cartelas
              </Label>
              <p className="text-sm text-muted-foreground">
                Choose whether players see the winner&apos;s phone number, and
                if so whether it is shown fully or partially masked.
              </p>
              {configQuery.data?.updatedAt ? (
                <p className="text-xs text-muted-foreground">
                  Last updated {formatDateTime(configQuery.data.updatedAt)}
                </p>
              ) : null}
            </div>
            <Select
              value={winnerPhoneDisplayMode}
              onValueChange={(value) =>
                setWinnerPhoneDisplayMode(value as WinnerPhoneDisplayMode)
              }
            >
              <SelectTrigger
                id="winner-phone-display-mode"
                className="w-full sm:max-w-md"
              >
                <SelectValue placeholder="Select display mode" />
              </SelectTrigger>
              <SelectContent>
                {WINNER_PHONE_DISPLAY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedOption ? (
              <p className="text-sm text-muted-foreground">
                {selectedOption.description}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
