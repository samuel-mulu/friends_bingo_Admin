"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";

import { changeAdminPassword } from "@/lib/api/admin";
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

export function ChangePasswordManagement() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const saveMutation = useAdminMutation({
    mutationFn: () =>
      changeAdminPassword({
        currentPassword,
        newPassword,
      }),
    successMessage: "Password changed successfully.",
    errorMessage: "Password could not be changed.",
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setValidationError(null);
    },
  });

  const isDirty =
    currentPassword.length > 0 ||
    newPassword.length > 0 ||
    confirmPassword.length > 0;

  function resetFields() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setValidationError(null);
  }

  function handleSubmit() {
    if (newPassword.length < 6) {
      setValidationError("New password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setValidationError("New password and confirmation do not match.");
      return;
    }

    if (newPassword === currentPassword) {
      setValidationError(
        "New password must be different from the current password.",
      );
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
              <KeyRound className="size-5" />
              Change password
            </CardTitle>
            <CardDescription>
              Update the password for your admin account. Other sessions will
              need to sign in again after a successful change.
            </CardDescription>
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
                !currentPassword ||
                !newPassword ||
                !confirmPassword ||
                saveMutation.isPending
              }
              isLoading={saveMutation.isPending}
              onClick={handleSubmit}
            >
              Save password
            </LoadingButton>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-6">
        <div className="space-y-2 max-w-md">
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </div>
        <div className="space-y-2 max-w-md">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </div>
        <div className="space-y-2 max-w-md">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </div>
        {validationError ? (
          <p className="text-sm text-destructive">{validationError}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
