"use client";

import { useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";

import { useCookieAuth } from "@/lib/auth/cookie-provider";
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

// Loading overlay component for smooth transitions
function LoadingOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/80 backdrop-blur-sm transition-opacity duration-300">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-primary" />
          <span className="text-sm font-medium text-primary">Signing in...</span>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { isHydrated, login, isLoading } = useCookieAuth();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const result = await login(phoneNumber, password);
    if (result.success) {
      // Hard navigation to ensure server reads the fresh cookie
      window.location.replace("/dashboard");
    }
  }

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
          <form className="space-y-4" onSubmit={handleSubmit}>
            {isLoading ? (
              <LoadingOverlay>
                <div className="space-y-4 opacity-50">
                  <div className="space-y-2">
                    <Label htmlFor="phone-number">Phone number</Label>
                    <Input
                      id="phone-number"
                      autoComplete="tel"
                      placeholder="0912345678"
                      value={phoneNumber}
                      disabled
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
                      disabled
                    />
                  </div>
                  <Button type="submit" className="h-10 w-full" disabled>
                    <Loader2 className="size-4 animate-spin" />
                    Signing in...
                  </Button>
                </div>
              </LoadingOverlay>
            ) : (
              <>
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
                <Button
                  type="submit"
                  className="h-10 w-full transition-all duration-200 hover:shadow-md active:scale-[0.98]"
                  disabled={
                    phoneNumber.trim().length === 0 ||
                    password.trim().length === 0
                  }
                >
                  Sign In
                </Button>
              </>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
