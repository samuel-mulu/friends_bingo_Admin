"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import {
  changeAdminDepositManualApprovalPin,
  getAdminDepositManualApprovalPinConfig,
} from "@/lib/api/admin";
import { useAdminMutation } from "@/lib/admin/use-admin-mutation";
import { LoadingButton } from "@/components/admin/loading-button";
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

const pinQueryKey = ["admin", "deposit-manual-approval-pin"] as const;

const sixDigitPinPattern = /^\d{6}$/;

function formatPinUpdatedAt(iso: string) {
  if (iso === "1970-01-01T00:00:00.000Z") {
    return "Default PIN (not yet changed in settings)";
  }
  return new Date(iso).toLocaleString();
}

export function DepositManualApprovalPinManagement() {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const configQuery = useQuery({
    queryKey: pinQueryKey,
    queryFn: getAdminDepositManualApprovalPinConfig,
  });

  const saveMutation = useAdminMutation({
    mutationFn: () =>
      changeAdminDepositManualApprovalPin({
        currentPin: currentPin.trim(),
        newPin: newPin.trim(),
      }),
    successMessage: "Deposit approval PIN updated.",
    errorMessage: "Deposit approval PIN could not be updated.",
    invalidateQueryKeys: [pinQueryKey],
    onSuccess: () => {
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      setValidationError(null);
    },
  });

  const isDirty =
    currentPin.length > 0 || newPin.length > 0 || confirmPin.length > 0;

  function resetFields() {
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setValidationError(null);
  }

  function handleSubmit() {
    if (!sixDigitPinPattern.test(currentPin.trim())) {
      setValidationError("Current PIN must be exactly 6 digits.");
      return;
    }
    if (!sixDigitPinPattern.test(newPin.trim())) {
      setValidationError("New PIN must be exactly 6 digits.");
      return;
    }
    if (newPin.trim() !== confirmPin.trim()) {
      setValidationError("New PIN and confirmation do not match.");
      return;
    }
    if (newPin.trim() === currentPin.trim()) {
      setValidationError("New PIN must be different from the current PIN.");
      return;
    }

    setValidationError(null);
    saveMutation.mutate(undefined);
  }

  return (
    <Card>
      <CardHeader className="gap-3 border-b border-border/60">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5" />
              Deposit approval PIN
            </CardTitle>
            <CardDescription>
              Six-digit PIN required to approve manual deposits. The PIN is
              stored securely on the server and is never shown after it is set.
            </CardDescription>
            {configQuery.data ? (
              <p className="text-sm text-muted-foreground">
                Last updated:{" "}
                {formatPinUpdatedAt(configQuery.data.updatedAt)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!isDirty || saveMutation.isPending}
              onClick={resetFields}
            >
              Reset
            </Button>
            <LoadingButton
              type="button"
              disabled={
                !currentPin ||
                !newPin ||
                !confirmPin ||
                saveMutation.isPending
              }
              isLoading={saveMutation.isPending}
              onClick={handleSubmit}
            >
              Save PIN
            </LoadingButton>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-6">
        <div className="space-y-2 max-w-md">
          <Label htmlFor="deposit-approval-current-pin">Current PIN</Label>
          <Input
            id="deposit-approval-current-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={currentPin}
            onChange={(event) =>
              setCurrentPin(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
          />
        </div>
        <div className="space-y-2 max-w-md">
          <Label htmlFor="deposit-approval-new-pin">New PIN</Label>
          <Input
            id="deposit-approval-new-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={newPin}
            onChange={(event) =>
              setNewPin(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
          />
        </div>
        <div className="space-y-2 max-w-md">
          <Label htmlFor="deposit-approval-confirm-pin">Confirm new PIN</Label>
          <Input
            id="deposit-approval-confirm-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={confirmPin}
            onChange={(event) =>
              setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
          />
        </div>
        {validationError ? (
          <p className="text-sm text-destructive">{validationError}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
