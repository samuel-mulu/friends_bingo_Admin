"use client";

import Link from "next/link";
import { Inbox, LogOut, ReceiptText, Shield } from "lucide-react";

import { AdminSidebarToggle } from "@/components/admin/admin-sidebar";
import { useOpenFeedbackCount } from "@/lib/admin/use-open-feedback-count";
import { usePendingWithdrawalsCount } from "@/lib/admin/use-pending-withdrawals-count";
import { pageTitleFromPath } from "@/lib/navigation";
import { useCookieAuth } from "@/lib/auth/cookie-provider";
import type { AdminUser } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AdminTopbarProps {
  pathname: string;
  initialUser: AdminUser;
  sidebarOpen: boolean;
  onSidebarOpenChange: (open: boolean) => void;
}

export function AdminTopbar({
  pathname,
  initialUser,
  sidebarOpen,
  onSidebarOpenChange,
}: AdminTopbarProps) {
  const { logout } = useCookieAuth();
  const user = initialUser;
  const { count: pendingWithdrawals } = usePendingWithdrawalsCount();
  const { count: openFeedback } = useOpenFeedbackCount();
  const isWithdrawalsActive =
    pathname === "/withdrawals" || pathname.startsWith("/withdrawals/");
  const isFeedbackActive =
    pathname === "/feedback" || pathname.startsWith("/feedback/");

  return (
    <header className="z-20 shrink-0 border-b border-border/60 bg-white/80 backdrop-blur">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <AdminSidebarToggle
            open={sidebarOpen}
            onOpenChange={onSidebarOpenChange}
          />
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
              Operations
            </p>
            <h1 className="truncate text-lg font-semibold text-foreground sm:text-xl">
              {pageTitleFromPath(pathname)}
            </h1>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Button
            asChild
            variant={isWithdrawalsActive ? "default" : "outline"}
            className="relative h-10 gap-2 px-3"
          >
            <Link href="/withdrawals" aria-label="Open withdrawals">
              <ReceiptText className="size-4" />
              <span className="hidden sm:inline">Withdrawals</span>
              {pendingWithdrawals > 0 ? (
                <span
                  className={cn(
                    "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                    isWithdrawalsActive
                      ? "bg-white text-red-600"
                      : "bg-red-600 text-white",
                  )}
                  aria-label={`${pendingWithdrawals} pending withdrawals`}
                >
                  {pendingWithdrawals > 99 ? "99+" : pendingWithdrawals}
                </span>
              ) : null}
            </Link>
          </Button>

          <Button
            asChild
            variant={isFeedbackActive ? "default" : "outline"}
            className="relative h-10 gap-2 px-3"
          >
            <Link href="/feedback" aria-label="Open feedback">
              <Inbox className="size-4" />
              <span className="hidden sm:inline">Feedback</span>
              {openFeedback > 0 ? (
                <span
                  className={cn(
                    "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                    isFeedbackActive
                      ? "bg-white text-red-600"
                      : "bg-red-600 text-white",
                  )}
                  aria-label={`${openFeedback} open feedback`}
                >
                  {openFeedback > 99 ? "99+" : openFeedback}
                </span>
              ) : null}
            </Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-10 gap-3 px-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Shield className="size-4" />
                </div>
                <div className="hidden text-left md:block">
                  <div className="text-sm font-medium">{user.fullName}</div>
                  <div className="text-xs text-muted-foreground">
                    {user.phoneNumber}
                  </div>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Admin account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}>
                <LogOut className="size-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
