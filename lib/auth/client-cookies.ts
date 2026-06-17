// Client-side cookie utilities
// Note: httpOnly cookies cannot be read from JavaScript
// These are for non-httpOnly cookies only

function getCookieValue(name: string): string | null {
  if (typeof window === "undefined") return null;

  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [cookieName, ...cookieVal] = cookie.trim().split("=");
    if (cookieName === name) {
      return decodeURIComponent(cookieVal.join("="));
    }
  }
  return null;
}

export function getUserFromClientCookie(): { role: string; fullName?: string; phoneNumber?: string } | null {
  const value = getCookieValue("user_data");
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  const user = getUserFromClientCookie();
  return user?.role === "ADMIN";
}
