"use server";

import { cookies } from "next/headers";
import type { AdminSession } from "@/lib/api/types";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const USER_DATA_KEY = "user_data";

// 30 minutes for access token (matches backend)
const ACCESS_TOKEN_MAX_AGE = 30 * 60;
// 30 days for refresh token
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60;

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
