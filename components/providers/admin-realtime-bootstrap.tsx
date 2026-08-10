"use client";

import { useEffect, useState } from "react";

import { useCookieAuth } from "@/lib/auth/cookie-provider";
import {
  createAdminRealtimeBootstrap,
  resolveBrowserSocketBaseUrl,
  type AdminRealtimeBootstrapController,
} from "@/lib/socket/admin-realtime-bootstrap";
import { socketService } from "@/lib/socket/socket-service";

async function fetchRealtimeToken(options?: {
  forceRefresh?: boolean;
}): Promise<string | null> {
  const params = options?.forceRefresh ? "?forceRefresh=1" : "";
  const response = await fetch(`/api/auth/realtime-token${params}`, {
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    success?: boolean;
    data?: { token?: string | null };
  };

  return payload.success ? payload.data?.token?.trim() ?? null : null;
}

function createBootstrapController(): AdminRealtimeBootstrapController | null {
  const socketBaseUrl = resolveBrowserSocketBaseUrl();

  if (!socketBaseUrl) {
    console.error(
      "[AdminRealtime] NEXT_PUBLIC_SOCKET_URL is required in production; socket remains disconnected.",
    );
    return null;
  }

  return createAdminRealtimeBootstrap({
    socketBaseUrl,
    fetchRealtimeToken,
    connect: (url, token) => socketService.connect(url, token),
    disconnect: () => socketService.disconnect(),
    on: (event, handler) => socketService.on(event, handler),
    off: (event, handler) => socketService.off(event, handler),
  });
}

export function AdminRealtimeBootstrap() {
  const { isHydrated, isAuthenticated } = useCookieAuth();
  const [controller] = useState(createBootstrapController);

  useEffect(() => {
    if (!controller) {
      return;
    }

    controller.syncAuth({ isHydrated, isAuthenticated });
  }, [controller, isAuthenticated, isHydrated]);

  useEffect(() => {
    if (!controller) {
      return;
    }

    return () => {
      controller.dispose();
    };
  }, [controller]);

  return null;
}
