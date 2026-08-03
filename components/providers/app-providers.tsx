"use client";

import type { ReactNode } from "react";

import { AdminRealtimeBootstrap } from "@/components/providers/admin-realtime-bootstrap";
import { QueryProvider } from "@/components/providers/query-provider";
import { Toaster } from "@/components/ui/sonner";
import { CookieAuthProvider } from "@/lib/auth/cookie-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <CookieAuthProvider>
        <AdminRealtimeBootstrap />
        {children}
        <Toaster />
      </CookieAuthProvider>
    </QueryProvider>
  );
}
