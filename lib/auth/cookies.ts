"use server";

import { cookies } from "next/headers";
import type { AdminSession } from "@/lib/api/types";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const USER_DATA_KEY = "user_data";

// Short-lived access cookie; refreshed via refresh_token when expired.
const ACCESS_TOKEN_MAX_AGE = 30 * 60;
// 30 days for refresh token
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60;

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.API_BASE_URL?.trim() ||
  process.env.INTERNAL_API_URL?.trim() ||
  (process.env.NODE_ENV === "production" ? "" : "http://localhost:3002");

export async function setSessionCookies(session: AdminSession): Promise<void> {
  const cookieStore = await cookies();

  // Store access token in httpOnly cookie
  cookieStore.set(ACCESS_TOKEN_KEY, session.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ACCESS_TOKEN_MAX_AGE,
    path: "/",
  });

  // Store refresh token in httpOnly cookie
  if (session.refreshToken) {
    cookieStore.set(REFRESH_TOKEN_KEY, session.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: REFRESH_TOKEN_MAX_AGE,
      path: "/",
    });
  }

  // Store minimal user data in non-httpOnly cookie for client-side access
  cookieStore.set(USER_DATA_KEY, JSON.stringify(session.user), {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REFRESH_TOKEN_MAX_AGE,
    path: "/",
  });
}

export async function clearSessionCookies(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.delete(ACCESS_TOKEN_KEY);
  cookieStore.delete(REFRESH_TOKEN_KEY);
  cookieStore.delete(USER_DATA_KEY);
}

export async function getAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ACCESS_TOKEN_KEY)?.value ?? null;
}

export async function getRefreshToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(REFRESH_TOKEN_KEY)?.value ?? null;
}

export async function getUserFromCookies(): Promise<AdminSession["user"] | null> {
  const cookieStore = await cookies();
  const userData = cookieStore.get(USER_DATA_KEY)?.value;

  if (!userData) return null;

  try {
    return JSON.parse(userData) as AdminSession["user"];
  } catch {
    return null;
  }
}

export async function getSessionFromCookies(): Promise<AdminSession | null> {
  const [accessToken, refreshToken, user] = await Promise.all([
    getAccessToken(),
    getRefreshToken(),
    getUserFromCookies(),
  ]);

  if (!accessToken || !user) return null;

  return {
    accessToken,
    refreshToken: refreshToken ?? undefined,
    user,
  };
}

async function refreshSessionAccessToken(
  refreshToken: string,
): Promise<string | null> {
  if (!API_BASE_URL) return null;

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
    const newAccessToken = data.data?.accessToken as string | undefined;

    if (!newAccessToken) {
      await clearSessionCookies();
      return null;
    }

    await updateAccessToken(newAccessToken);

    if (data.data?.refreshToken) {
      const cookieStore = await cookies();
      cookieStore.set(REFRESH_TOKEN_KEY, data.data.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: REFRESH_TOKEN_MAX_AGE,
        path: "/",
      });
    }

    return newAccessToken;
  } catch {
    return null;
  }
}

/**
 * Read-only session check for Server Components.
 * Do not refresh/set cookies here — Next.js only allows cookie writes in
 * Route Handlers / Server Actions. Use /api/auth/refresh for page reloads.
 */
export async function ensureSessionFromCookies(): Promise<AdminSession | null> {
  return getSessionFromCookies();
}

export async function updateAccessToken(token: string): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(ACCESS_TOKEN_KEY, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ACCESS_TOKEN_MAX_AGE,
    path: "/",
  });
}

/** Server Action / serverFetch helper: refresh + persist cookies. */
export async function refreshSessionFromCookies(): Promise<AdminSession | null> {
  const [refreshToken, user] = await Promise.all([
    getRefreshToken(),
    getUserFromCookies(),
  ]);

  if (!refreshToken || !user) {
    return null;
  }

  const newAccessToken = await refreshSessionAccessToken(refreshToken);
  if (!newAccessToken) {
    return null;
  }

  const rotatedRefresh = await getRefreshToken();

  return {
    accessToken: newAccessToken,
    refreshToken: rotatedRefresh ?? refreshToken,
    user,
  };
}
