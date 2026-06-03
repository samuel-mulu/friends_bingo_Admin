"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmVariant = "default",
  onConfirm,
  isPending = false,
  field,
  errorMessage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  onConfirm: (value?: string) => void | Promise<void>;
  isPending?: boolean;
  field?: {
    label: string;
    placeholder?: string;
    defaultValue?: string;
    required?: boolean;
  };
  errorMessage?: string | null;
}) {
  const [value, setValue] = useState(field?.defaultValue ?? "");
  const dialogKey = `${open ? "open" : "closed"}:${field?.defaultValue ?? ""}:${title}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent key={dialogKey}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {field ? (
          <div className="space-y-2">
            <Label htmlFor="action-dialog-field">{field.label}</Label>
            <Input
              id="action-dialog-field"
              placeholder={field.placeholder}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </div>
        ) : null}
        {errorMessage ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant={confirmVariant}
            disabled={isPending || Boolean(field?.required && !value.trim())}
            onClick={() => onConfirm(value)}
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Working...
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
