"use client";

import { LogOut, Shield } from "lucide-react";

import { AdminMobileNav } from "@/components/admin/admin-sidebar";
import { pageTitleFromPath } from "@/lib/navigation";
import { useAuth } from "@/lib/auth/auth-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AdminTopbar({ pathname }: { pathname: string }) {
  const { session, logout } = useAuth();

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
                <div className="text-sm font-medium">
                  {session?.user.fullName}
                </div>
                <div className="text-xs text-muted-foreground">
                  {session?.user.phoneNumber}
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
    </header>
  );
}
