"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  Inbox,
  LogOut,
  ReceiptText,
  RefreshCw,
  Shield,
} from "lucide-react";

import { AdminSidebarToggle } from "@/components/admin/admin-sidebar";
import { useGeezSmsBalance } from "@/lib/admin/use-geez-sms-balance";
import { useOpenFeedbackCount } from "@/lib/admin/use-open-feedback-count";
import { usePendingDepositsCount } from "@/lib/admin/use-pending-deposits-count";
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

function formatSmsBalance(balance: string, currency: string | null): string {
  const amount = Number(balance);
  const formatted = Number.isFinite(amount)
    ? amount.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      })
    : balance;

  return currency ? `${formatted} ${currency}` : formatted;
}

function PendingCountBadge({
  count,
  active,
  label,
}: {
  count: number;
  active: boolean;
  label: string;
}) {
  if (count <= 0) {
    return null;
  }

  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
        active ? "bg-white text-red-600" : "bg-red-600 text-white",
      )}
      aria-label={label}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function AdminTopbar({
  pathname,
  initialUser,
  sidebarOpen,
  onSidebarOpenChange,
}: AdminTopbarProps) {
  const { logout } = useCookieAuth();
  const user = initialUser;
  const { count: pendingDeposits } = usePendingDepositsCount();
  const { count: pendingWithdrawals } = usePendingWithdrawalsCount();
  const { count: openFeedback } = useOpenFeedbackCount();
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [isRefreshingSms, setIsRefreshingSms] = useState(false);
  const smsBalance = useGeezSmsBalance({ enabled: adminMenuOpen });
  const isDepositsActive =
    pathname === "/deposits" || pathname.startsWith("/deposits/");
  const isWithdrawalsActive =
    pathname === "/withdrawals" || pathname.startsWith("/withdrawals/");
  const isFeedbackActive =
    pathname === "/feedback" || pathname.startsWith("/feedback/");

  const refreshSmsBalance = async () => {
    setIsRefreshingSms(true);
    try {
      await smsBalance.refetch();
    } finally {
      setIsRefreshingSms(false);
    }
  };

  const smsBalanceLabel =
    smsBalance.isLoading || isRefreshingSms
      ? "Loading…"
      : smsBalance.balance != null
        ? formatSmsBalance(smsBalance.balance, smsBalance.currency)
        : smsBalance.error
          ? "Unavailable"
          : "—";

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
            variant={isDepositsActive ? "default" : "outline"}
            className="relative h-10 gap-2 px-3"
          >
            <Link href="/deposits" aria-label="Open deposits">
              <CreditCard className="size-4" />
              <span className="hidden sm:inline">Deposits</span>
              <PendingCountBadge
                count={pendingDeposits}
                active={isDepositsActive}
                label={`${pendingDeposits} pending deposits`}
              />
            </Link>
          </Button>

          <Button
            asChild
            variant={isWithdrawalsActive ? "default" : "outline"}
            className="relative h-10 gap-2 px-3"
          >
            <Link href="/withdrawals" aria-label="Open withdrawals">
              <ReceiptText className="size-4" />
              <span className="hidden sm:inline">Withdrawals</span>
              <PendingCountBadge
                count={pendingWithdrawals}
                active={isWithdrawalsActive}
                label={`${pendingWithdrawals} pending withdrawals`}
              />
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
              <PendingCountBadge
                count={openFeedback}
                active={isFeedbackActive}
                label={`${openFeedback} open feedback`}
              />
            </Link>
          </Button>

          <DropdownMenu open={adminMenuOpen} onOpenChange={setAdminMenuOpen}>
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
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Admin account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="px-2 py-2">
                <div className="rounded-lg border bg-muted/30 px-3 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    GeezSMS balance
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                    {smsBalanceLabel}
                  </p>
                  {smsBalance.error ? (
                    <p className="mt-2 text-xs text-amber-700">{smsBalance.error}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-8 w-full justify-start px-2"
                  onClick={() => {
                    void refreshSmsBalance();
                  }}
                  disabled={isRefreshingSms || smsBalance.isLoading}
                >
                  <RefreshCw
                    className={cn(
                      "size-3.5",
                      (isRefreshingSms || smsBalance.isLoading) && "animate-spin",
                    )}
                  />
                  Refresh SMS balance
                </Button>
              </div>
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
