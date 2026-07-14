import { NextRequest, NextResponse } from "next/server";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const USER_DATA_KEY = "user_data";
const ACCESS_TOKEN_MAX_AGE = 30 * 60;
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60;

function resolveApiBaseUrl() {
  const configured =
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
    process.env.API_BASE_URL?.trim() ||
    process.env.INTERNAL_API_URL?.trim();

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  return "http://localhost:3002";
}

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/games";
  }
  if (raw.startsWith("/api") || raw.startsWith("/login")) {
    return "/games";
  }
  return raw;
}

function clearSession(response: NextResponse) {
  response.cookies.delete(ACCESS_TOKEN_KEY);
  response.cookies.delete(REFRESH_TOKEN_KEY);
  response.cookies.delete(USER_DATA_KEY);
}

/**
 * Route Handler refresh — cookie writes are valid here (unlike RSC layouts).
 * Used when access_token expired but refresh_token is still present.
 */
export async function GET(request: NextRequest) {
  const nextPath = safeNextPath(request.nextUrl.searchParams.get("next"));
  const apiBaseUrl = resolveApiBaseUrl();
  const refreshToken = request.cookies.get(REFRESH_TOKEN_KEY)?.value;
  const userData = request.cookies.get(USER_DATA_KEY)?.value;

  if (!apiBaseUrl || !refreshToken || !userData) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    clearSession(response);
    return response;
  }

  try {
    const user = JSON.parse(userData) as { role?: string };
    if (user.role !== "ADMIN") {
      const response = NextResponse.redirect(new URL("/login", request.url));
      clearSession(response);
      return response;
    }
  } catch {
    const response = NextResponse.redirect(new URL("/login", request.url));
    clearSession(response);
    return response;
  }

  const refreshResponse = await fetch(`${apiBaseUrl}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
  }).catch(() => null);

  if (!refreshResponse?.ok) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    clearSession(response);
    return response;
  }

  const data = await refreshResponse.json().catch(() => null);
  const accessToken = data?.data?.accessToken;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    clearSession(response);
    return response;
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url));
  response.cookies.set(ACCESS_TOKEN_KEY, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ACCESS_TOKEN_MAX_AGE,
    path: "/",
  });

  if (typeof data?.data?.refreshToken === "string") {
    response.cookies.set(REFRESH_TOKEN_KEY, data.data.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: REFRESH_TOKEN_MAX_AGE,
      path: "/",
    });
  }

  return response;
}
