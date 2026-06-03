"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ShieldCheck, Loader2 } from "lucide-react";

import { loginAdmin } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const { isHydrated, isAuthenticated, login } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (isHydrated && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isHydrated, router]);

  const loginMutation = useMutation({
    mutationFn: () => loginAdmin({ phoneNumber, password }),
    onSuccess: (session) => {
      if (session.user.role !== "ADMIN") {
        setFormError("Only admin accounts can access this dashboard.");
        return;
      }

      login(session);
      router.replace("/dashboard");
    },
    onError: (error) => {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Could not sign in. Please try again.",
      );
    },
  });

  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(13,92,99,0.12),_transparent_50%),linear-gradient(180deg,#f7faf8_0%,#eef5f3_100%)] px-6">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(13,92,99,0.12),_transparent_50%),linear-gradient(180deg,#f7faf8_0%,#eef5f3_100%)] px-6 py-12">
      <Card className="w-full max-w-md border-white/70 bg-white/90 shadow-xl shadow-black/5 backdrop-blur">
        <CardHeader className="space-y-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="size-6" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-2xl">Admin Sign In</CardTitle>
            <CardDescription>
              Login with your admin phone number to access Friends Bingo
              operations.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              setFormError(null);
              loginMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="phone-number">Phone number</Label>
              <Input
                id="phone-number"
                autoComplete="tel"
                placeholder="0912345678"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {formError ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            ) : null}
            <Button
              type="submit"
              className="h-10 w-full"
              disabled={
                loginMutation.isPending ||
                phoneNumber.trim().length === 0 ||
                password.trim().length === 0
              }
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
