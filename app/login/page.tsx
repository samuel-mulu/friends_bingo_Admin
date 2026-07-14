import { redirect } from "next/navigation";

import { LoginForm } from "@/app/login/login-form";
import {
  getAccessToken,
  getRefreshToken,
  getUserFromCookies,
} from "@/lib/auth/cookies";

export default async function LoginPage() {
  const [accessToken, refreshToken, user] = await Promise.all([
    getAccessToken(),
    getRefreshToken(),
    getUserFromCookies(),
  ]);

  if (accessToken && user?.role === "ADMIN") {
    redirect("/games");
  }

  // Access expired but refresh still valid — restore session properly.
  if (refreshToken && user?.role === "ADMIN") {
    redirect("/api/auth/refresh?next=/games");
  }

  return <LoginForm />;
}
