import { NextRequest, NextResponse } from "next/server";

import {
  clearSessionCookies,
  resolveRealtimeAccessToken,
  setTokenCookies,
} from "@/lib/auth/server-token";

/**
 * Returns the current access JWT for Socket.IO auth.
 * httpOnly cookies cannot be read in the browser, so the client fetches this
 * after login / before reconnect.
 */
export async function GET(request: NextRequest) {
  const forceRefresh =
    request.nextUrl.searchParams.get("forceRefresh") === "1";
  const resolved = await resolveRealtimeAccessToken(request, { forceRefresh });

  if (!resolved) {
    const response = NextResponse.json(
      {
        success: false,
        error: {
          statusCode: 401,
          message: "Not authenticated",
        },
      },
      { status: 401 },
    );
    clearSessionCookies(response);
    return response;
  }

  const response = NextResponse.json({
    success: true,
    data: { token: resolved.token },
  });

  if (resolved.refreshed) {
    setTokenCookies(response, resolved.refreshed);
  }

  return response;
}
