import { NextRequest, NextResponse } from "next/server";

export const ACCESS_TOKEN_KEY = "access_token";
export const REFRESH_TOKEN_KEY = "refresh_token";
export const USER_DATA_KEY = "user_data";
export const ACCESS_TOKEN_MAX_AGE = 30 * 60;
export const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60;

export type RefreshedTokens = {
  accessToken: string;
  refreshToken?: string;
};

/**
 * NestJS base URL for server-side proxy / auth only.
 * Prefer runtime server env so Docker can override without baking NEXT_PUBLIC_*.
 */
export function resolveApiBaseUrl(): string | null {
  const configured =
    process.env.INTERNAL_API_URL?.trim() ||
    process.env.API_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  return "http://localhost:3002";
}

export async function refreshAccessToken(
  request: NextRequest,
): Promise<RefreshedTokens | null> {
  const apiBaseUrl = resolveApiBaseUrl();
  if (!apiBaseUrl) {
    return null;
  }

  const refreshToken = request.cookies.get(REFRESH_TOKEN_KEY)?.value;
  if (!refreshToken) {
    return null;
  }

  const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
  }).catch(() => null);

  if (!response?.ok) {
    return null;
  }

  const data = await response.json().catch(() => null);
  const accessToken = data?.data?.accessToken;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    return null;
  }

  const nextRefreshToken =
    typeof data?.data?.refreshToken === "string"
      ? data.data.refreshToken
      : undefined;

  return {
    accessToken,
    refreshToken: nextRefreshToken,
  };
}

export function setTokenCookies(
  response: NextResponse,
  tokens: RefreshedTokens,
): void {
  response.cookies.set(ACCESS_TOKEN_KEY, tokens.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ACCESS_TOKEN_MAX_AGE,
    path: "/",
  });

  if (tokens.refreshToken) {
    response.cookies.set(REFRESH_TOKEN_KEY, tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: REFRESH_TOKEN_MAX_AGE,
      path: "/",
    });
  }
}

export function clearSessionCookies(response: NextResponse): void {
  response.cookies.delete(ACCESS_TOKEN_KEY);
  response.cookies.delete(REFRESH_TOKEN_KEY);
  response.cookies.delete(USER_DATA_KEY);
}

/**
 * Resolve a JWT for Socket.IO: use the access cookie, or refresh if absent.
 * Pass forceRefresh when Socket.IO reports connect_error (expired JWT).
 */
export async function resolveRealtimeAccessToken(
  request: NextRequest,
  options?: { forceRefresh?: boolean },
): Promise<{ token: string; refreshed: RefreshedTokens | null } | null> {
  if (!options?.forceRefresh) {
    const existing = request.cookies.get(ACCESS_TOKEN_KEY)?.value?.trim();
    if (existing) {
      return { token: existing, refreshed: null };
    }
  }

  const refreshed = await refreshAccessToken(request);
  if (!refreshed) {
    return null;
  }

  return { token: refreshed.accessToken, refreshed };
}
