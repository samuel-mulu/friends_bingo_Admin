"use server";

import { getAccessToken, getRefreshToken, updateAccessToken, clearSessionCookies } from "@/lib/auth/cookies";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  "http://localhost:3002";

interface FetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      await clearSessionCookies();
      return null;
    }

    const data = await response.json();
    const newAccessToken = data.data?.accessToken;

    if (!newAccessToken) {
      await clearSessionCookies();
      return null;
    }

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

    return newAccessToken;
  } catch {
    return null;
  }
}

export async function serverFetch<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const { method = "GET", body, headers = {}, skipAuth = false } = options;

  let accessToken: string | null = null;

  if (!skipAuth) {
    accessToken = await getAccessToken();

    // If no access token but we have a refresh token, try to refresh
    if (!accessToken) {
      const refreshToken = await getRefreshToken();
      if (refreshToken) {
        accessToken = await refreshAccessToken();
      }
    }
  }

  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...headers,
  };

  if (accessToken) {
    requestHeaders["Authorization"] = `Bearer ${accessToken}`;
  }

  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Handle 401 by attempting token refresh once
  if (response.status === 401 && !skipAuth) {
    const newToken = await refreshAccessToken();

    if (newToken) {
      // Retry the request with new token
      requestHeaders["Authorization"] = `Bearer ${newToken}`;
      const retryResponse = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!retryResponse.ok) {
        const errorData = await retryResponse.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Request failed: ${retryResponse.status}`);
      }

      return retryResponse.json();
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Request failed: ${response.status}`);
  }

  const data = await response.json();
  return data.data ?? data;
}

// Helper functions for common HTTP methods
export async function serverGet<T>(endpoint: string): Promise<T> {
  return serverFetch<T>(endpoint, { method: "GET" });
}

export async function serverPost<T>(endpoint: string, body: unknown): Promise<T> {
  return serverFetch<T>(endpoint, { method: "POST", body });
}

export async function serverPut<T>(endpoint: string, body: unknown): Promise<T> {
  return serverFetch<T>(endpoint, { method: "PUT", body });
}

export async function serverPatch<T>(endpoint: string, body: unknown): Promise<T> {
  return serverFetch<T>(endpoint, { method: "PATCH", body });
}

export async function serverDelete<T>(endpoint: string): Promise<T> {
  return serverFetch<T>(endpoint, { method: "DELETE" });
}
