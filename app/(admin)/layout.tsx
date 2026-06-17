import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { getSessionFromCookies } from "@/lib/auth/cookies";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Server-side auth check. user_data alone is not enough: it is readable by
  // the browser and can outlive the httpOnly access token.
  const session = await getSessionFromCookies();
  const user = session?.user;

  if (!user || user.role !== "ADMIN") {
    redirect("/login");
  }

  return <AdminShell initialUser={user}>{children}</AdminShell>;
}
