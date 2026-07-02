import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BadgeCheck,
  Clock3,
  CreditCard,
  Gamepad2,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  ReceiptText,
  Settings,
  Users,
} from "lucide-react";

export interface NavigationItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const adminNavigation: NavigationItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/games", label: "Games", icon: Gamepad2 },
  { href: "/bingo-claims", label: "Bingo Claims", icon: BadgeCheck },
  { href: "/players", label: "Players", icon: Users },
  { href: "/feedback", label: "Feedback", icon: Inbox },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/deposits", label: "Deposits", icon: CreditCard },
  { href: "/withdrawals", label: "Withdrawals", icon: ReceiptText },
  { href: "/reports/financial", label: "Financial Reports", icon: BarChart3 },
  { href: "/reports/games", label: "Game Reports", icon: BarChart3 },
];

export const adminSecondaryNavigation: NavigationItem[] = [
  { href: "/time-config", label: "Time Config", icon: Clock3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function pageTitleFromPath(pathname: string) {
  if (pathname.startsWith("/reports/financial")) {
    return "Financial Reports";
  }

  if (pathname.startsWith("/reports/games")) {
    return "Game Reports";
  }

  const item =
    [...adminNavigation, ...adminSecondaryNavigation].find(
      (entry) =>
        pathname === entry.href || pathname.startsWith(`${entry.href}/`),
    ) ?? null;

  return item?.label ?? "Dashboard";
}
