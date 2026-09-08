import { NextRequest, NextResponse } from "next/server";

import {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  clearSessionCookies,
  resolveApiBaseUrl,
  setTokenCookies,
  type RefreshedTokens,
} from "@/lib/auth/server-token";

type RouteContext = {
  params: Promise<{ path: string[] }>;
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
  const API_BASE_URL = resolveApiBaseUrl();
  if (!API_BASE_URL) {
    return backendUnavailableResponse(
      "Backend API URL is not configured for this deployment.",
    );
  }

  const { path } = await context.params;
  const targetUrl = new URL(`${API_BASE_URL}/${path.join("/")}`);
  targetUrl.search = request.nextUrl.search;

  const requestBody = await readRequestBody(request);
  const requestHeaders = buildBackendHeaders(request);
  const accessToken = request.cookies.get(ACCESS_TOKEN_KEY)?.value;

  if (accessToken) {
    requestHeaders.set("Authorization", `Bearer ${accessToken}`);
  }

  let backendResponse = await fetchBackend(targetUrl, {
    method: request.method,
    headers: requestHeaders,
    body: requestBody,
    cache: "no-store",
  });

  if (backendResponse instanceof NextResponse) {
    return backendResponse;
  }

  if (backendResponse.status !== 401) {
    return toNextResponse(backendResponse);
  }

  const refreshResult = await tryRefreshAccessToken(request);
  if (refreshResult.kind === "unavailable") {
    return backendUnavailableResponse(
      "Backend service is unavailable right now.",
    );
  }

  if (refreshResult.kind === "rejected") {
    const response = await toNextResponse(backendResponse);
    clearSessionCookies(response);
    return response;
  }

  requestHeaders.set("Authorization", `Bearer ${refreshResult.tokens.accessToken}`);
  backendResponse = await fetchBackend(targetUrl, {
    method: request.method,
    headers: requestHeaders,
    body: requestBody,
    cache: "no-store",
  });

  if (backendResponse instanceof NextResponse) {
    return backendResponse;
  }

  const response = await toNextResponse(backendResponse);
  setTokenCookies(response, refreshResult.tokens);
  return response;
}

async function tryRefreshAccessToken(
  request: NextRequest,
): Promise<
  | { kind: "ok"; tokens: RefreshedTokens }
  | { kind: "rejected" }
  | { kind: "unavailable" }
> {
  const apiBaseUrl = resolveApiBaseUrl();
  if (!apiBaseUrl) {
    return { kind: "unavailable" };
  }

  const refreshToken = request.cookies.get(REFRESH_TOKEN_KEY)?.value;
  if (!refreshToken) {
    return { kind: "rejected" };
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
  } catch {
    return { kind: "unavailable" };
  }

  if (!response.ok) {
    // Only treat auth rejection as logout; 5xx keeps the session.
    if (response.status === 401 || response.status === 403) {
      return { kind: "rejected" };
    }
    return { kind: "unavailable" };
  }

  const data = await response.json().catch(() => null);
  const accessToken = data?.data?.accessToken;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    return { kind: "rejected" };
  }

  const nextRefreshToken =
    typeof data?.data?.refreshToken === "string"
      ? data.data.refreshToken
      : undefined;

  return {
    kind: "ok",
    tokens: {
      accessToken,
      refreshToken: nextRefreshToken,
    },
  };
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

async function fetchBackend(
  input: URL | string,
  init: RequestInit,
): Promise<Response | NextResponse> {
  try {
    return await fetch(input, init);
  } catch (error) {
    return backendUnavailableResponse(
      "Backend service is unavailable right now.",
      error,
    );
  }
}

function backendUnavailableResponse(message: string, error?: unknown) {
  const details =
    process.env.NODE_ENV === "production"
      ? undefined
      : error instanceof Error
        ? { cause: error.message }
        : { cause: String(error ?? "unknown") };

  return NextResponse.json(
    {
      success: false,
      error: {
        statusCode: 503,
        message,
        ...(details ? { details } : {}),
      },
    },
    { status: 503 },
  );
}
