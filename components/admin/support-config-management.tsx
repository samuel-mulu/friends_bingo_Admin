"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Headphones, Loader2 } from "lucide-react";

import {
  getAdminSupportConfig,
  updateAdminSupportConfig,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const supportConfigQueryKey = ["admin", "support-config"] as const;

export function SupportConfigManagement() {
  const [phoneNumber1, setPhoneNumber1] = useState("");
  const [phoneNumber2, setPhoneNumber2] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");
  const [termsBody, setTermsBody] = useState("");

  const configQuery = useQuery({
    queryKey: supportConfigQueryKey,
    queryFn: getAdminSupportConfig,
  });

  useEffect(() => {
    if (configQuery.data) {
      setPhoneNumber1(configQuery.data.phoneNumber1);
      setPhoneNumber2(configQuery.data.phoneNumber2);
      setTelegramUsername(configQuery.data.telegramUsername);
      setTermsBody(configQuery.data.termsBody);
    }
  }, [configQuery.data]);

  const saveMutation = useAdminMutation({
    mutationFn: () =>
      updateAdminSupportConfig({
        phoneNumber1: phoneNumber1.trim(),
        phoneNumber2: phoneNumber2.trim(),
        telegramUsername: telegramUsername.trim().replace(/^@+/, ""),
        termsBody: termsBody.trim(),
      }),
    invalidateQueryKeys: [supportConfigQueryKey],
    successMessage: "Contact and terms settings saved.",
    errorMessage: "Contact and terms settings could not be saved.",
  });

  const isDirty =
    configQuery.data != null &&
    (configQuery.data.phoneNumber1 !== phoneNumber1.trim() ||
      configQuery.data.phoneNumber2 !== phoneNumber2.trim() ||
      configQuery.data.telegramUsername !==
        telegramUsername.trim().replace(/^@+/, "") ||
      configQuery.data.termsBody !== termsBody.trim());

  const canSave =
    isDirty &&
    phoneNumber1.trim().length > 0 &&
    telegramUsername.trim().replace(/^@+/, "").length > 0 &&
    termsBody.trim().length > 0;

  if (configQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading contact and terms settings…
      </div>
    );
  }

  if (configQuery.isError) {
    return (
      <AdminErrorState
        title="Could not load contact and terms settings"
        description={getApiErrorMessage(
          configQuery.error,
          "Something went wrong while loading contact and terms settings.",
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
                <Headphones className="size-5" />
                Contact us & terms
              </CardTitle>
              <CardDescription>
                Phone numbers, Telegram handle, and Terms and Conditions shown
                in the player app Contact Us section.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!isDirty || saveMutation.isPending}
                onClick={() => {
                  if (configQuery.data) {
                    setPhoneNumber1(configQuery.data.phoneNumber1);
                    setPhoneNumber2(configQuery.data.phoneNumber2);
                    setTelegramUsername(configQuery.data.telegramUsername);
                    setTermsBody(configQuery.data.termsBody);
                  }
                }}
              >
                Reset changes
              </Button>
              <LoadingButton
                type="button"
                disabled={!canSave}
                isLoading={saveMutation.isPending}
                onClick={() => saveMutation.mutate(undefined)}
              >
                Save
              </LoadingButton>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="support-phone-1">Phone number 1</Label>
              <Input
                id="support-phone-1"
                value={phoneNumber1}
                onChange={(event) => setPhoneNumber1(event.target.value)}
                placeholder="0961355799"
                inputMode="tel"
                autoComplete="tel"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="support-phone-2">Phone number 2</Label>
              <Input
                id="support-phone-2"
                value={phoneNumber2}
                onChange={(event) => setPhoneNumber2(event.target.value)}
                placeholder="0983299318"
                inputMode="tel"
                autoComplete="tel"
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to hide the second number in the app.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="support-telegram">Telegram username</Label>
            <Input
              id="support-telegram"
              value={telegramUsername}
              onChange={(event) => setTelegramUsername(event.target.value)}
              placeholder="friendschewata"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Without @. Opens as https://t.me/
              {telegramUsername.trim().replace(/^@+/, "") || "username"}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="support-terms">Terms and conditions</Label>
            <textarea
              id="support-terms"
              rows={14}
              value={termsBody}
              onChange={(event) => setTermsBody(event.target.value)}
              placeholder="Enter the terms and conditions players will see…"
              className="flex min-h-[220px] w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {configQuery.data?.updatedAt ? (
            <p className="text-xs text-muted-foreground">
              Last updated {formatDateTime(configQuery.data.updatedAt)}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
