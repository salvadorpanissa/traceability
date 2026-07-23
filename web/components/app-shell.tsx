"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { SettingsMenu } from "@/components/settings-menu";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/context";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  labelKey: TranslationKey;
  isActive: (pathname: string) => boolean;
};

const navItems: NavItem[] = [
  {
    href: "/activities/health",
    labelKey: "appShell.navHealth",
    isActive: (pathname) => pathname.startsWith("/activities/health"),
  },
  {
    href: "/activities/transfer",
    labelKey: "appShell.navTransfer",
    isActive: (pathname) => pathname.startsWith("/activities/transfer"),
  },
  {
    href: "/settings/own-tags",
    labelKey: "appShell.navRegisterTags",
    isActive: (pathname) => pathname.startsWith("/settings/own-tags"),
  },
];

export function AppShell({
  userName,
  children,
}: {
  userName: string;
  children: React.ReactNode;
}) {
  const { t } = useLocale();
  const pathname = usePathname();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-background px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3 md:flex-none">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              aria-label={isMobileNavOpen ? t("appShell.closeNavigation") : t("appShell.openNavigation")}
              aria-expanded={isMobileNavOpen}
              aria-controls="mobile-navigation"
              onClick={() => setIsMobileNavOpen((previous) => !previous)}
            >
              {isMobileNavOpen ? <X /> : <Menu />}
            </Button>
            <Link
              href="/dashboard"
              className="truncate text-base font-bold md:text-lg"
              onClick={() => {
                setIsMobileNavOpen(false);
                setIsUserMenuOpen(false);
              }}
            >
              {t("app.title")}
            </Link>
          </div>

          <nav
            aria-label={t("appShell.navigation")}
            className="hidden flex-1 items-center justify-center gap-1 md:flex"
          >
            {navItems.map((item) => {
              const isActive = item.isActive(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => {
                    setIsMobileNavOpen(false);
                    setIsUserMenuOpen(false);
                  }}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive ? "bg-muted text-foreground" : "text-muted-foreground"
                  )}
                >
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </nav>

          <div className="flex min-w-0 items-center justify-end gap-2 md:gap-3">
            <SettingsMenu />

            <div className="relative" ref={userMenuRef}>
              <Button
                type="button"
                variant="ghost"
                aria-label={t("appShell.userMenu")}
                aria-haspopup="menu"
                aria-expanded={isUserMenuOpen}
                onClick={() => setIsUserMenuOpen((previous) => !previous)}
                className="max-w-36 truncate"
              >
                {userName}
              </Button>
              {isUserMenuOpen ? (
                <div className="absolute right-0 z-10 mt-2 min-w-40 rounded-md border bg-background p-1 shadow-md">
                  <LogoutButton className="w-full justify-start" />
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {isMobileNavOpen ? (
          <div id="mobile-navigation" className="mt-3 border-t pt-3 md:hidden">
            <nav aria-label={t("appShell.navigation")} className="flex flex-col gap-1">
              {navItems.map((item) => {
                const isActive = item.isActive(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => {
                      setIsMobileNavOpen(false);
                      setIsUserMenuOpen(false);
                    }}
                    className={cn(
                      "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isActive ? "bg-muted text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {t(item.labelKey)}
                  </Link>
                );
              })}
            </nav>
          </div>
        ) : null}
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
