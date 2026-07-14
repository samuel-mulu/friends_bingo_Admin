"use client";

import { useCallback, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import {
  AdminSidebarNav,
} from "@/components/admin/admin-sidebar";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import type { AdminUser } from "@/lib/api/types";

interface AdminShellProps {
  children: ReactNode;
  initialUser: AdminUser;
}

export function AdminShell({ children, initialUser }: AdminShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const onSidebarOpenChange = useCallback((open: boolean) => {
    setSidebarOpen(open);
  }, []);

  return (
    <div className="min-h-dvh bg-[linear-gradient(180deg,#f7faf8_0%,#f2f7f5_40%,#eef4f2_100%)]">
      <div className="mx-auto flex h-dvh w-full max-w-[1600px] flex-col overflow-hidden">
        <AdminSidebarNav
          pathname={pathname}
          open={sidebarOpen}
          onOpenChange={onSidebarOpenChange}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <AdminTopbar
            pathname={pathname}
            initialUser={initialUser}
            sidebarOpen={sidebarOpen}
            onSidebarOpenChange={onSidebarOpenChange}
          />
          <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
