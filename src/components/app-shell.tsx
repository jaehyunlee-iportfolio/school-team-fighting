"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r bg-background transition-[width] duration-200",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((p) => !p)}
        />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex h-14 items-center gap-2 border-b bg-background/80 backdrop-blur px-4">
          <SheetTrigger
            render={<Button variant="ghost" size="icon" className="size-8" />}
          >
            <Menu className="size-5" />
          </SheetTrigger>
          <span className="text-sm font-semibold tracking-tight">
            school-team
          </span>
        </div>
        <SheetContent side="left" className="w-60 p-0">
          <SheetTitle className="sr-only">내비게이션</SheetTitle>
          <Sidebar
            collapsed={false}
            onToggle={() => {}}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <main className="flex-1 overflow-auto md:pt-0 pt-14">{children}</main>
    </div>
  );
}
