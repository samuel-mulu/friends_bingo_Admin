"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Menu, PanelLeftClose } from "lucide-react";

import { adminNavigation, adminSecondaryNavigation } from "@/lib/navigation";
import { usePendingWithdrawalsCount } from "@/lib/admin/use-pending-withdrawals-count";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function AdminSidebarNav({
  pathname,
  open,
  onOpenChange,
}: {
  pathname: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  useEffect(() => {
    onOpenChange(false);
  }, [pathname, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[min(18rem,88vw)] p-0 sm:max-w-72"
        showCloseButton={false}
      >
        <SheetHeader className="flex-row items-center justify-between border-b border-border/60 px-4 py-3 text-left">
          <SheetTitle className="text-base">Friends Bingo Admin</SheetTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Hide navigation"
            onClick={() => onOpenChange(false)}
          >
            <PanelLeftClose className="size-4" />
          </Button>
        </SheetHeader>
        <div className="h-[calc(100%-3.5rem)] overflow-y-auto p-4">
          <SidebarContent
            pathname={pathname}
            onNavigate={() => onOpenChange(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function AdminSidebarToggle({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="shrink-0"
      aria-label={open ? "Hide navigation" : "Show navigation"}
      aria-expanded={open}
      onClick={() => onOpenChange(!open)}
    >
      <Menu className="size-4" />
    </Button>
  );
}

function SidebarContent({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate: () => void;
}) {
  const { count: pendingWithdrawals } = usePendingWithdrawalsCount();

  return (
    <div className="flex h-full flex-col gap-6">
      <BrandBlock />
      <nav className="space-y-1">
        {adminNavigation.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          const badgeCount =
            item.href === "/withdrawals" ? pendingWithdrawals : 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {badgeCount > 0 ? (
                <span
                  className={cn(
                    "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                    isActive
                      ? "bg-white text-red-600"
                      : "bg-red-600 text-white",
                  )}
                  aria-label={`${badgeCount} pending withdrawals`}
                >
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-1 border-t border-border/60 pt-4">
        {adminSecondaryNavigation.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function BrandBlock() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0d5c63_0%,#1f7a8c_100%)] text-sm font-semibold text-white shadow-sm">
        FB
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">Friends Bingo</p>
        <p className="text-xs text-muted-foreground">Admin control panel</p>
      </div>
    </div>
  );
}
