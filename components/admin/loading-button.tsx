"use client";

import type { ComponentProps, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import type { VariantProps } from "class-variance-authority";

import { Button, type buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LoadingButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    isLoading?: boolean;
    loadingLabel?: ReactNode;
  };

export function LoadingButton({
  isLoading = false,
  loadingLabel,
  children,
  disabled,
  className,
  ...props
}: LoadingButtonProps) {
  return (
    <Button
      disabled={disabled || isLoading}
      className={cn(className)}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {loadingLabel !== undefined ? loadingLabel : children}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
