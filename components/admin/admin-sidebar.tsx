"use client";

import Link from "next/link";
import { Menu } from "lucide-react";

import { adminNavigation, adminSecondaryNavigation } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function AdminSidebar({ pathname }: { pathname: string }) {
  return (
    <aside className="hidden w-72 shrink-0 border-r border-border/60 bg-white/80 px-4 py-5 backdrop-blur lg:flex lg:flex-col">
      <SidebarContent pathname={pathname} />
    </aside>
  );
}

export function AdminMobileNav({ pathname }: { pathname: string }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="shrink-0 lg:hidden">
          <Menu className="size-4" />
          <span className="sr-only">Open navigation</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(20rem,88vw)] p-0">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>Friends Bingo Admin</SheetTitle>
        </SheetHeader>
        <div className="p-4">
          <SidebarContent pathname={pathname} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SidebarContent({ pathname }: { pathname: string }) {
  return (
    <div className="flex h-full flex-col gap-6">
      <BrandBlock />
      <nav className="space-y-1">
        {adminNavigation.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-1 border-t border-border/60 pt-4">
        {adminSecondaryNavigation.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function BrandBlock() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0d5c63_0%,#1f7a8c_100%)] text-sm font-semibold text-white shadow-sm">
        FB
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">Friends Bingo</p>
        <p className="text-xs text-muted-foreground">Admin control panel</p>
      </div>
    </div>
  );
}
