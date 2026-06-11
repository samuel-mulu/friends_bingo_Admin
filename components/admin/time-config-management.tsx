"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock3, Loader2 } from "lucide-react";

import { getAdminTimeConfig, updateAdminTimeConfig } from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import type {
  GameTimingConfig,
  UpdateGameTimingConfigPayload,
} from "@/lib/api/types";
import { formatDateTime } from "@/lib/formatters";
import { useAdminMutation } from "@/lib/admin/use-admin-mutation";
import { LoadingButton } from "@/components/admin/loading-button";
import {
  AdminEmptyState,
  AdminErrorState,
} from "@/components/admin/admin-table-state";
import { PageHeader } from "@/components/admin/page-header";
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
    hint: "AUTO mode registration window for new games.",
    min: 10,
    max: 600,
  },
  {
    key: "autoCallIntervalSeconds",
    label: "Auto-call interval (seconds)",
    hint: "Default delay between balls for new AUTO games.",
    min: 3,
    max: 60,
  },
  {
    key: "winnerWindowSeconds",
    label: "Winner window (seconds)",
    hint: "How long other players can claim after the first valid bingo.",
    min: 5,
    max: 120,
  },
];

const cartelaFields: TimingField[] = [
  {
    key: "cartelaHoldSeconds",
    label: "Cartela hold / reservation (seconds)",
    hint: "How long a player may hold a cartela before confirming.",
    min: 5,
    max: 30,
  },
];

const playerUiFields: TimingField[] = [
  {
    key: "finishedResultDisplaySeconds",
    label: "Finished result display (seconds)",
    hint: "Minimum time the player app shows finished results before advancing.",
    min: 1,
    max: 30,
  },
  {
    key: "preparingDisplayMaxSeconds",
    label: "Preparing game max wait (seconds)",
    hint: "Optional cap while waiting for PLAYING. Leave empty to disable.",
    min: 5,
    max: 120,
    optional: true,
  },
  {
    key: "missedNumberAnimationMs",
    label: "Missed number animation delay (ms)",
    hint: "Stagger between balls when catching up after reconnect.",
    min: 50,
    max: 2000,
    step: 50,
  },
  {
    key: "missedNumberStaggerMaxBalls",
    label: "Missed number stagger cap (balls)",
    hint: "Maximum animated balls before a final sync.",
    min: 1,
    max: 75,
  },
];

const refreshFields: TimingField[] = [
  {
    key: "adminRefreshDebounceMs",
    label: "Admin operations debounce (ms)",
    hint: "Delay before REST refresh after socket structural events.",
    min: 500,
    max: 30000,
    step: 100,
  },
  {
    key: "adminFallbackPollingSeconds",
    label: "Admin fallback polling (seconds)",
    hint: "Polling interval when the operations socket is disconnected.",
    min: 1,
    max: 60,
  },
  {
    key: "flutterRefetchDebounceMs",
    label: "Flutter refetch debounce (ms)",
    hint: "Player app delay before canonical REST refresh after socket bursts.",
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
  };
}

function buildUpdatePayload(
  draft: Record<string, string>,
  baseline: GameTimingConfig,
): UpdateGameTimingConfigPayload {
  const payload: UpdateGameTimingConfigPayload = {};

  const compareNumber = (
    key: Exclude<TimingFieldKey, "preparingDisplayMaxSeconds">,
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
  description: string;
  fields: TimingField[];
  draft: Record<string, string>;
  onChange: (key: TimingFieldKey, value: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
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
            <p className="text-sm text-muted-foreground">
              {field.hint} {field.min}–{field.max}
              {field.optional ? " · optional" : ""}
            </p>
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
    successMessage: "Timing defaults saved.",
    errorMessage: "Could not save timing defaults.",
    invalidateQueryKeys: [timeConfigQueryKey],
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

    const payload = buildUpdatePayload(draft, timeConfigQuery.data);
    if (Object.keys(payload).length === 0) {
      setFormError("No changes to save.");
      return;
    }

    saveMutation.mutate(payload);
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
        <PageHeader
          title="Time Config"
          description="Defaults for new games and client behavior. Active games keep their saved timings."
        />
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
      <PageHeader
        title="Time Config"
        description="Defaults for new games and client behavior. Active games keep their saved timings."
      />

      <Card>
        <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-muted/60 p-2.5">
              <Clock3 className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-foreground">Saved defaults</p>
              <p className="text-sm text-muted-foreground">
                Applies to new registrations, new winner windows, and new
                reservations. Active session snapshots stay unchanged.
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Last saved {lastUpdated}</p>
        </CardContent>
      </Card>

      <TimingFieldGroup
        title="Game automation"
        description="Registration, auto-call, and winner window defaults for AUTO games."
        fields={gameAutomationFields}
        draft={draft}
        onChange={handleFieldChange}
      />

      <TimingFieldGroup
        title="Cartela registration"
        description="Reservation hold duration shared with the player app."
        fields={cartelaFields}
        draft={draft}
        onChange={handleFieldChange}
      />

      <TimingFieldGroup
        title="Player app transitions"
        description="Client UX timings exposed through GET /games/time-config."
        fields={playerUiFields}
        draft={draft}
        onChange={handleFieldChange}
      />

      <TimingFieldGroup
        title="System refresh"
        description="Debounce and fallback polling for admin and player clients."
        fields={refreshFields}
        draft={draft}
        onChange={handleFieldChange}
      />

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
