"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock3, Loader2 } from "lucide-react";

import {
  getAdminTimeConfig,
  updateAdminSlotOperationMode,
  updateAdminTimeConfig,
  type GameOperationItem,
} from "@/lib/api/admin";
import { createCurrentGameOperationsQueryOptions } from "@/lib/admin/current-game-operations";
import { getApiErrorMessage } from "@/lib/api/errors";
import type {
  GameTimingConfig,
  UpdateGameTimingConfigPayload,
} from "@/lib/api/types";
import { formatDateTime } from "@/lib/formatters";
import { getFocusedGameForModeSwitch } from "@/lib/admin/game-operation-defaults";
import { operationsQueryKey } from "@/lib/admin/game-operations-cache";
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

const timeConfigQueryKey = ["admin", "time-config"] as const;

type TimingFieldKey = keyof UpdateGameTimingConfigPayload;

type DraftRecord = Record<string, string>;

type TimingField = {
  key: TimingFieldKey;
  label: string;
  hint: string;
  min: number;
  max: number;
  step?: number;
  optional?: boolean;
};

const gameAutomationFields: TimingField[] = [
  {
    key: "registrationDurationSeconds",
    label: "Registration duration (seconds)",
    hint: "",
    min: 10,
    max: 600,
  },
  {
    key: "autoCallIntervalSeconds",
    label: "Time between balls (seconds)",
    hint: "",
    min: 3,
    max: 60,
  },
  {
    key: "winnerWindowSeconds",
    label: "Winner window (seconds)",
    hint: "",
    min: 5,
    max: 120,
  },
];

const cartelaFields: TimingField[] = [
  {
    key: "cartelaHoldSeconds",
    label: "Cartela hold (seconds)",
    hint: "",
    min: 5,
    max: 30,
  },
];

const playerUiFields: TimingField[] = [
  {
    key: "finishedResultDisplaySeconds",
    label: "Finished results screen (seconds)",
    hint: "",
    min: 1,
    max: 120,
  },
  {
    key: "preparingDisplayMaxSeconds",
    label: "Preparing game max wait (seconds)",
    hint: "",
    min: 5,
    max: 120,
    optional: true,
  },
  {
    key: "missedNumberAnimationMs",
    label: "Catch-up animation delay (ms)",
    hint: "",
    min: 50,
    max: 2000,
    step: 50,
  },
  {
    key: "missedNumberStaggerMaxBalls",
    label: "Catch-up animation limit (balls)",
    hint: "",
    min: 1,
    max: 75,
  },
];

const refreshFields: TimingField[] = [
  {
    key: "adminRefreshDebounceMs",
    label: "Admin refresh delay (ms)",
    hint: "Short delay before refreshing admin data after live updates.",
    min: 500,
    max: 30000,
    step: 100,
  },
  {
    key: "adminFallbackPollingSeconds",
    label: "Admin fallback polling (seconds)",
    hint: "How often to refresh when live updates are disconnected.",
    min: 1,
    max: 60,
  },
  {
    key: "flutterRefetchDebounceMs",
    label: "Player app refresh delay (ms)",
    hint: "Short delay before the player app refreshes after live updates.",
    min: 100,
    max: 5000,
    step: 50,
  },
];

function configToDraft(config: GameTimingConfig): Record<string, string> {
  return {
    registrationDurationSeconds: String(config.registrationDurationSeconds),
    autoCallIntervalSeconds: String(config.autoCallIntervalSeconds),
    winnerWindowSeconds: String(config.winnerWindowSeconds),
    cartelaHoldSeconds: String(config.cartelaHoldSeconds),
    finishedResultDisplaySeconds: String(config.finishedResultDisplaySeconds),
    preparingDisplayMaxSeconds:
      config.preparingDisplayMaxSeconds == null
        ? ""
        : String(config.preparingDisplayMaxSeconds),
    missedNumberAnimationMs: String(config.missedNumberAnimationMs),
    missedNumberStaggerMaxBalls: String(config.missedNumberStaggerMaxBalls),
    adminRefreshDebounceMs: String(config.adminRefreshDebounceMs),
    adminFallbackPollingSeconds: String(config.adminFallbackPollingSeconds),
    flutterRefetchDebounceMs: String(config.flutterRefetchDebounceMs),
    normalDefaultEntryFee: config.normalDefaultEntryFee,
    normalDefaultCompanyFeePerCartela: config.normalDefaultCompanyFeePerCartela,
  };
}

function computePrizePerCartela(entryFee: string, commission: string): string {
  const entry = Number(entryFee);
  const fee = Number(commission);
  if (!Number.isFinite(entry) || !Number.isFinite(fee)) {
    return "—";
  }
  const prize = entry - fee;
  return prize >= 0 ? prize.toFixed(2).replace(/\.00$/, "") : "—";
}

function validateEconomicDraft(draft: DraftRecord): string | null {
  const entryRaw = draft.normalDefaultEntryFee?.trim() ?? "";
  const commissionRaw = draft.normalDefaultCompanyFeePerCartela?.trim() ?? "";

  if (!entryRaw || !commissionRaw) {
    return "Default entry fee and commission are required.";
  }

  if (!/^\d+(\.\d{1,2})?$/.test(entryRaw)) {
    return "Default entry fee must be a valid amount.";
  }

  if (!/^\d+(\.\d{1,2})?$/.test(commissionRaw)) {
    return "Default commission must be a valid amount.";
  }

  const entry = Number(entryRaw);
  const commission = Number(commissionRaw);

  if (entry < 1 || entry > 999) {
    return "Default entry fee must be between 1 and 999 ETB.";
  }

  if (commission < 0) {
    return "Default commission must be at least 0 ETB.";
  }

  if (entry - commission < 1) {
    return "Default prize per cartela must be at least 1 ETB.";
  }

  return null;
}

function buildUpdatePayload(
  draft: Record<string, string>,
  baseline: GameTimingConfig,
): UpdateGameTimingConfigPayload {
  const payload: UpdateGameTimingConfigPayload = {};

  const compareNumber = (
    key: Exclude<
      TimingFieldKey,
      | "preparingDisplayMaxSeconds"
      | "normalDefaultEntryFee"
      | "normalDefaultCompanyFeePerCartela"
    >,
    value: number,
  ) => {
    if (value !== baseline[key]) {
      payload[key] = value;
    }
  };

  compareNumber(
    "registrationDurationSeconds",
    Number(draft.registrationDurationSeconds),
  );
  compareNumber(
    "autoCallIntervalSeconds",
    Number(draft.autoCallIntervalSeconds),
  );
  compareNumber("winnerWindowSeconds", Number(draft.winnerWindowSeconds));
  compareNumber("cartelaHoldSeconds", Number(draft.cartelaHoldSeconds));
  compareNumber(
    "finishedResultDisplaySeconds",
    Number(draft.finishedResultDisplaySeconds),
  );
  compareNumber(
    "missedNumberAnimationMs",
    Number(draft.missedNumberAnimationMs),
  );
  compareNumber(
    "missedNumberStaggerMaxBalls",
    Number(draft.missedNumberStaggerMaxBalls),
  );
  compareNumber(
    "adminRefreshDebounceMs",
    Number(draft.adminRefreshDebounceMs),
  );
  compareNumber(
    "adminFallbackPollingSeconds",
    Number(draft.adminFallbackPollingSeconds),
  );
  compareNumber(
    "flutterRefetchDebounceMs",
    Number(draft.flutterRefetchDebounceMs),
  );

  if (draft.normalDefaultEntryFee !== baseline.normalDefaultEntryFee) {
    payload.normalDefaultEntryFee = draft.normalDefaultEntryFee.trim();
  }
  if (
    draft.normalDefaultCompanyFeePerCartela !==
    baseline.normalDefaultCompanyFeePerCartela
  ) {
    payload.normalDefaultCompanyFeePerCartela =
      draft.normalDefaultCompanyFeePerCartela.trim();
  }

  const preparingRaw = draft.preparingDisplayMaxSeconds.trim();
  const preparingValue = preparingRaw === "" ? null : Number(preparingRaw);
  if (preparingValue !== baseline.preparingDisplayMaxSeconds) {
    payload.preparingDisplayMaxSeconds = preparingValue;
  }

  return payload;
}

function validateDraft(
  draft: Record<string, string>,
  fields: TimingField[],
): string | null {
  for (const field of fields) {
    const raw = draft[field.key]?.trim() ?? "";

    if (field.optional && raw === "") {
      continue;
    }

    if (!field.optional && raw === "") {
      return `${field.label} is required.`;
    }

    const value = Number(raw);
    if (!Number.isInteger(value)) {
      return `${field.label} must be a whole number.`;
    }

    if (value < field.min || value > field.max) {
      return `${field.label} must be between ${field.min} and ${field.max}.`;
    }
  }

  return null;
}

function TimingFieldGroup({
  title,
  description,
  fields,
  draft,
  onChange,
}: {
  title: string;
  description?: string;
  fields: TimingField[];
  draft: Record<string, string>;
  onChange: (key: TimingFieldKey, value: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-2">
        {fields.map((field) => (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>{field.label}</Label>
            <Input
              id={field.key}
              type="number"
              min={field.min}
              max={field.max}
              step={field.step ?? 1}
              value={draft[field.key] ?? ""}
              onChange={(event) => onChange(field.key, event.target.value)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function TimeConfigManagement() {
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const timeConfigQuery = useQuery({
    queryKey: timeConfigQueryKey,
    queryFn: getAdminTimeConfig,
  });

  useEffect(() => {
    if (timeConfigQuery.data) {
      setDraft(configToDraft(timeConfigQuery.data));
      setFormError(null);
    }
  }, [timeConfigQuery.data]);

  const saveMutation = useAdminMutation({
    mutationFn: (payload: UpdateGameTimingConfigPayload) =>
      updateAdminTimeConfig(payload),
    successMessage: "Timing defaults saved. New games will use these values.",
    errorMessage: "Could not save timing defaults.",
    invalidateQueryKeys: [timeConfigQueryKey],
  });

  const operationsQuery = useQuery(createCurrentGameOperationsQueryOptions());

  const focusedGame = operationsQuery.data
    ? getFocusedGameForModeSwitch(operationsQuery.data)
    : null;

  const applyToCurrentGameMutation = useAdminMutation({
    mutationFn: ({
      game,
      registrationDurationSeconds,
      autoCallIntervalSeconds,
    }: {
      game: GameOperationItem;
      registrationDurationSeconds: number;
      autoCallIntervalSeconds: number;
    }) =>
      updateAdminSlotOperationMode(game.slotId, {
        operationMode: "AUTO",
        registrationDurationSeconds,
        autoCallIntervalSeconds,
      }),
    successMessage: "Timing applied to the current game.",
    errorMessage: "Could not apply timing to the current game.",
    invalidateQueryKeys: [operationsQueryKey],
  });

  const allFields = useMemo(
    () => [
      ...gameAutomationFields,
      ...cartelaFields,
      ...playerUiFields,
      ...refreshFields,
    ],
    [],
  );

  const handleFieldChange = (key: TimingFieldKey, value: string) => {
    setDraft((current) => ({
      ...(current ?? {}),
      [key]: value,
    }));
    setFormError(null);
  };

  const handleReset = () => {
    if (timeConfigQuery.data) {
      setDraft(configToDraft(timeConfigQuery.data));
      setFormError(null);
    }
  };

  const handleSave = () => {
    if (!draft || !timeConfigQuery.data) {
      return;
    }

    const validationError = validateDraft(draft, allFields);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const economicValidationError = validateEconomicDraft(draft);
    if (economicValidationError) {
      setFormError(economicValidationError);
      return;
    }

    const payload = buildUpdatePayload(draft, timeConfigQuery.data);
    if (Object.keys(payload).length === 0) {
      setFormError("No changes to save.");
      return;
    }

    saveMutation.mutate(payload);
  };

  const canApplyToCurrentGame =
    focusedGame != null && focusedGame.operationMode === "AUTO";

  const applyToCurrentGameHint = !focusedGame
    ? "No active game right now."
    : focusedGame.operationMode !== "AUTO"
      ? "The current game is manual."
      : focusedGame.playerStatus === "registrationOpen"
        ? "Restarts registration with the duration above."
        : "Updates the live game timing.";

  const handleApplyToCurrentGame = () => {
    if (!draft || !focusedGame || !canApplyToCurrentGame) {
      return;
    }

    const validationError = validateDraft(draft, gameAutomationFields);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    applyToCurrentGameMutation.mutate({
      game: focusedGame,
      registrationDurationSeconds: Number(draft.registrationDurationSeconds),
      autoCallIntervalSeconds: Number(draft.autoCallIntervalSeconds),
    });
  };

  if (timeConfigQuery.isLoading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (timeConfigQuery.isError || !timeConfigQuery.data || !draft) {
    return (
      <div className="space-y-6">
        <AdminErrorState
          title="Could not load timing defaults"
          description={getApiErrorMessage(timeConfigQuery.error)}
          onRetry={() => void timeConfigQuery.refetch()}
        />
      </div>
    );
  }

  const lastUpdated = formatDateTime(timeConfigQuery.data.updatedAt);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-muted/60 p-2.5">
              <Clock3 className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-foreground">Saved defaults</p>
              <p className="text-sm text-muted-foreground">
                Used when new games are created.
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Last saved {lastUpdated}</p>
        </CardContent>
      </Card>

      <TimingFieldGroup
        title="Game automation"
        fields={gameAutomationFields}
        draft={draft}
        onChange={handleFieldChange}
      />

      <TimingFieldGroup
        title="Cartela registration"
        fields={cartelaFields}
        draft={draft}
        onChange={handleFieldChange}
      />

      <TimingFieldGroup
        title="Player app"
        fields={playerUiFields}
        draft={draft}
        onChange={handleFieldChange}
      />

      <Card>
        <CardHeader>
          <CardTitle>Economic config (NORMAL games)</CardTitle>
          <CardDescription>
            Default entry fee and commission for newly created normal games.
            Prize per cartela is calculated automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="normalDefaultEntryFee">Default entry fee (ETB)</Label>
            <Input
              id="normalDefaultEntryFee"
              type="number"
              min={1}
              max={999}
              step="0.01"
              value={draft.normalDefaultEntryFee ?? ""}
              onChange={(event) =>
                handleFieldChange("normalDefaultEntryFee", event.target.value)
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="normalDefaultCompanyFeePerCartela">
              Default commission (ETB)
            </Label>
            <Input
              id="normalDefaultCompanyFeePerCartela"
              type="number"
              min={0}
              step="0.01"
              value={draft.normalDefaultCompanyFeePerCartela ?? ""}
              onChange={(event) =>
                handleFieldChange(
                  "normalDefaultCompanyFeePerCartela",
                  event.target.value,
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Default prize per cartela</Label>
            <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium">
              {computePrizePerCartela(
                draft.normalDefaultEntryFee ?? "",
                draft.normalDefaultCompanyFeePerCartela ?? "",
              )}{" "}
              ETB
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Apply to current game</CardTitle>
          <CardDescription>
            Copy registration and ball timing to the game that is running now.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {applyToCurrentGameHint}
          </p>
          <LoadingButton
            variant="outline"
            isLoading={applyToCurrentGameMutation.isPending}
            disabled={!canApplyToCurrentGame}
            onClick={handleApplyToCurrentGame}
          >
            Apply to current game
          </LoadingButton>
        </CardContent>
      </Card>

      {formError ? (
        <AdminEmptyState title="Could not save" description={formError} />
      ) : null}

      <div className="flex flex-wrap gap-3">
        <LoadingButton
          isLoading={saveMutation.isPending}
          onClick={handleSave}
        >
          Save defaults
        </LoadingButton>
        <Button variant="outline" onClick={handleReset}>
          Reset changes
        </Button>
      </div>
    </div>
  );
}
