"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { loginAction, logoutAction } from "./actions";
import { getUserFromClientCookie } from "./client-cookies";
import type { AdminSession } from "@/lib/api/types";

interface AuthContextValue {
  isHydrated: boolean;
  isAuthenticated: boolean;
  user: { role: string } | null;
  login: (phoneNumber: string, password: string) => Promise<{ success: boolean; error?: string | undefined }>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function CookieAuthProvider({ children }: { children: ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<{ role: string } | null>(null);

  // Hydrate from client-side cookie on mount
  useEffect(() => {
    const clientUser = getUserFromClientCookie();
    setUser(clientUser);
    setIsHydrated(true);
  }, []);

  const isAuthenticated = useMemo(() => user?.role === "ADMIN", [user]);

  const login = useCallback(
    async (phoneNumber: string, password: string) => {
      setIsLoading(true);
      const startTime = Date.now();

      try {
        const result = await loginAction({ phoneNumber, password });

        if (result.success) {
          // Update user from client cookie after successful login
          const clientUser = getUserFromClientCookie();
          setUser(clientUser);
          toast.success("Welcome back!", {
            description: "Successfully signed in.",
          });

          // Minimum 800ms loading for perceived performance
          const elapsed = Date.now() - startTime;
          if (elapsed < 800) {
            await new Promise((resolve) => setTimeout(resolve, 800 - elapsed));
          }
        } else {
          toast.error("Sign in failed", {
            description: result.error || "Invalid credentials.",
          });
        }

        return result;
      } catch {
        toast.error("Sign in failed", {
          description: "Something went wrong. Please try again.",
        });
        return { success: false, error: "Unexpected error" };
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await logoutAction();
      setUser(null);
      toast.success("Signed out", {
        description: "You have been successfully logged out.",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isHydrated,
      isAuthenticated,
      user,
      login,
      logout,
      isLoading,
    }),
    [isHydrated, isAuthenticated, user, login, logout, isLoading]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useCookieAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useCookieAuth must be used within CookieAuthProvider.");
  }

  return context;
}
