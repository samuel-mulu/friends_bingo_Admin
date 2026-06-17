import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  "http://localhost:3002";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const USER_DATA_KEY = "user_data";
const ACCESS_TOKEN_MAX_AGE = 30 * 60;
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60;

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

type RefreshedTokens = {
  accessToken: string;
  refreshToken?: string;
};

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyBackendRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyBackendRequest(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxyBackendRequest(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxyBackendRequest(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyBackendRequest(request, context);
}

async function proxyBackendRequest(
  request: NextRequest,
  context: RouteContext,
) {
  const { path } = await context.params;
  const targetUrl = new URL(`${API_BASE_URL}/${path.join("/")}`);
  targetUrl.search = request.nextUrl.search;

  const requestBody = await readRequestBody(request);
  const requestHeaders = buildBackendHeaders(request);
  const accessToken = request.cookies.get(ACCESS_TOKEN_KEY)?.value;

  if (accessToken) {
    requestHeaders.set("Authorization", `Bearer ${accessToken}`);
  }

  let backendResponse = await fetch(targetUrl, {
    method: request.method,
    headers: requestHeaders,
    body: requestBody,
    cache: "no-store",
  });

  if (backendResponse.status !== 401) {
    return toNextResponse(backendResponse);
  }

  const refreshedTokens = await refreshAccessToken(request);
  if (!refreshedTokens) {
    const response = await toNextResponse(backendResponse);
    clearSessionCookies(response);
    return response;
  }

  requestHeaders.set("Authorization", `Bearer ${refreshedTokens.accessToken}`);
  backendResponse = await fetch(targetUrl, {
    method: request.method,
    headers: requestHeaders,
    body: requestBody,
    cache: "no-store",
  });

  const response = await toNextResponse(backendResponse);
  setTokenCookies(response, refreshedTokens);
  return response;
}

function buildBackendHeaders(request: NextRequest) {
  const headers = new Headers(request.headers);

  headers.delete("authorization");
  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("cookie");
  headers.delete("host");

  return headers;
}

async function readRequestBody(request: NextRequest) {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  const body = await request.text();
  return body.length > 0 ? body : undefined;
}

async function refreshAccessToken(
  request: NextRequest,
): Promise<RefreshedTokens | null> {
  const refreshToken = request.cookies.get(REFRESH_TOKEN_KEY)?.value;
  if (!refreshToken) {
    return null;
  }

  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
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

async function toNextResponse(response: Response) {
  const headers = new Headers(response.headers);
  headers.delete("connection");
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("transfer-encoding");

  const body =
    response.status === 204 || response.status === 304
      ? null
      : await response.arrayBuffer();

  return new NextResponse(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function setTokenCookies(response: NextResponse, tokens: RefreshedTokens) {
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

function clearSessionCookies(response: NextResponse) {
  response.cookies.delete(ACCESS_TOKEN_KEY);
  response.cookies.delete(REFRESH_TOKEN_KEY);
  response.cookies.delete(USER_DATA_KEY);
}
