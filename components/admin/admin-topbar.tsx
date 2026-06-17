"use client";

import { LogOut, Shield } from "lucide-react";

import { AdminMobileNav } from "@/components/admin/admin-sidebar";
import { pageTitleFromPath } from "@/lib/navigation";
import { useCookieAuth } from "@/lib/auth/cookie-provider";
import type { AdminUser } from "@/lib/api/types";
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
}

export function AdminTopbar({ pathname, initialUser }: AdminTopbarProps) {
  const { logout } = useCookieAuth();
  const user = initialUser;

  return (
    <header className="z-20 shrink-0 border-b border-border/60 bg-white/80 backdrop-blur">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <AdminMobileNav pathname={pathname} />
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
              Operations
            </p>
            <h1 className="truncate text-lg font-semibold text-foreground sm:text-xl">
              {pageTitleFromPath(pathname)}
            </h1>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-10 gap-3 px-3">
              <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Shield className="size-4" />
              </div>
              <div className="hidden text-left sm:block">
                <div className="text-sm font-medium">{user.fullName}</div>
                <div className="text-xs text-muted-foreground">{user.phoneNumber}</div>
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
    </header>
  );
}
