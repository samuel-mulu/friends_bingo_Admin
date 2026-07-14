import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import {
  getAccessToken,
  getRefreshToken,
  getUserFromCookies,
} from "@/lib/auth/cookies";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [accessToken, refreshToken, user] = await Promise.all([
    getAccessToken(),
    getRefreshToken(),
    getUserFromCookies(),
  ]);

  if (accessToken && user?.role === "ADMIN") {
    return <AdminShell initialUser={user}>{children}</AdminShell>;
  }

  // Access cookie expired: refresh via Route Handler so Set-Cookie sticks.
  if (refreshToken && user?.role === "ADMIN") {
    const headerStore = await headers();
    const pathname = headerStore.get("x-pathname") || "/games";
    const nextPath =
      pathname.startsWith("/") &&
      !pathname.startsWith("/api") &&
      pathname !== "/login"
        ? pathname
        : "/games";
    redirect(`/api/auth/refresh?next=${encodeURIComponent(nextPath)}`);
  }

  redirect("/login");
}
