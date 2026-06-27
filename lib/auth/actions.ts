"use server";

import { redirect } from "next/navigation";
import { serverFetch } from "@/lib/api/server-client";
import {
  clearSessionCookies,
  getRefreshToken,
  setSessionCookies,
  updateAccessToken,
} from "./cookies";
import type { AdminSession, LoginPayload } from "@/lib/api/types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.API_BASE_URL?.trim() ||
  process.env.INTERNAL_API_URL?.trim() ||
  (process.env.NODE_ENV === "production" ? "" : "http://localhost:3002");

export async function loginAction(payload: LoginPayload) {
  if (!API_BASE_URL) {
    return {
      success: false,
      error: "Backend API URL is not configured.",
    };
  }

  try {
    const session = await serverFetch<AdminSession>("/auth/login", {
      method: "POST",
      body: payload,
      skipAuth: true,
    });

    // Validate admin role
    if (session.user.role !== "ADMIN") {
      return {
        success: false,
        error: "Only admin accounts can access this dashboard.",
      };
    }

    // Set httpOnly cookies
    await setSessionCookies(session);

    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Authentication failed";
    return { success: false, error: message };
  }
}

export async function logoutAction() {
  if (!API_BASE_URL) {
    await clearSessionCookies();
    redirect("/login");
  }

  const refreshToken = await getRefreshToken();

  // Optional: Call backend logout to revoke refresh token
  if (refreshToken) {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // Ignore errors, still clear cookies
    }
  }

  await clearSessionCookies();
  redirect("/login");
}

export async function refreshTokenAction() {
  if (!API_BASE_URL) {
    return { success: false, error: "Backend API URL is not configured." };
  }

  const refreshToken = await getRefreshToken();

  if (!refreshToken) {
    return { success: false, error: "No refresh token" };
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/auth/refresh`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      }
    );

    if (!response.ok) {
      await clearSessionCookies();
      return { success: false, error: "Token refresh failed" };
    }

    const data = await response.json();
    const newAccessToken = data.data?.accessToken;

    if (!newAccessToken) {
      return { success: false, error: "Invalid refresh response" };
    }

    // Update access token cookie
    await updateAccessToken(newAccessToken);

    // Update refresh token if rotated
    if (data.data?.refreshToken) {
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      cookieStore.set("refresh_token", data.data.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60,
        path: "/",
      });
    }

    return { success: true, accessToken: newAccessToken };
  } catch {
    return { success: false, error: "Token refresh failed" };
  }
}
