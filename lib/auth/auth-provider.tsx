"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { AdminSession } from "@/lib/api/types";
import {
  clearStoredSession,
  getStoredSession,
  setStoredSession,
} from "@/lib/auth/storage";
import { socketService } from "@/lib/socket/socket-service";

interface AuthContextValue {
  isHydrated: boolean;
  isAuthenticated: boolean;
  session: AdminSession | null;
  login: (session: AdminSession) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AdminSession | null>(readInitialSession);
  const isHydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientSnapshot,
    getServerSnapshot,
  );

  const login = useCallback((nextSession: AdminSession) => {
    setStoredSession(nextSession);
    setSession(nextSession);
  }, []);

  const logout = useCallback(() => {
    clearStoredSession();
    setSession(null);
    socketService.disconnect();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }, []);

  useEffect(() => {
    if (session?.accessToken && typeof window !== "undefined") {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";
      socketService.connect(apiBaseUrl, session.accessToken);
    }

    return () => {
      if (!session) {
        socketService.disconnect();
      }
    };
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isHydrated,
      isAuthenticated: session?.user.role === "ADMIN",
      session,
      login,
      logout,
    }),
    [isHydrated, login, logout, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }

  return context;
}

function readInitialSession(): AdminSession | null {
  const storedSession = getStoredSession();

  if (storedSession?.user.role === "ADMIN") {
    return storedSession;
  }

  if (storedSession) {
    clearStoredSession();
  }

  return null;
}

function subscribeToHydration() {
  return () => undefined;
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}
