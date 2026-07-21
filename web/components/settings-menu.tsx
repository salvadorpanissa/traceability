"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

export function SettingsMenu() {
  const { locale, setLocale, t } = useLocale();
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const isEnglish = locale === "en";
  const isDarkMode = isClient && theme === "dark";

  useEffect(() => {
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
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
    <div className="relative" ref={menuRef}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t("settings.menu")}
        aria-expanded={isOpen}
        aria-controls="settings-menu-panel"
        onClick={() => setIsOpen((previous) => !previous)}
      >
        <Settings />
      </Button>

      <div
        id="settings-menu-panel"
        className={cn(
          "absolute right-0 z-20 mt-2 min-w-44 rounded-md border bg-background p-2 shadow-md",
          isOpen ? "block" : "hidden"
        )}
      >
        <div className="flex items-center justify-between gap-3 py-1">
          <span className="text-xs text-muted-foreground">{t("settings.language")}</span>
          <button
            type="button"
            role="switch"
            aria-label={t("settings.language")}
            aria-checked={isEnglish}
            onClick={() => setLocale(isEnglish ? "es" : "en")}
            className="inline-flex items-center gap-2 rounded-full bg-muted px-2 py-1 text-xs"
          >
            <span
              className={cn(
                "h-4 w-8 rounded-full transition-colors",
                isEnglish ? "bg-primary/30" : "bg-primary/60"
              )}
            >
              <span
                className={cn(
                  "mt-[2px] block h-3 w-3 rounded-full bg-primary transition-transform",
                  isEnglish ? "translate-x-[17px]" : "translate-x-[2px]"
                )}
              />
            </span>
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 py-1">
          <span className="text-xs text-muted-foreground">{t("settings.theme")}</span>
          <button
            type="button"
            role="switch"
            aria-label={t("settings.theme")}
            aria-checked={isDarkMode}
            onClick={() => setTheme(isDarkMode ? "light" : "dark")}
            className="inline-flex items-center gap-2 rounded-full bg-muted px-2 py-1 text-xs"
          >
            <span
              className={cn(
                "h-4 w-8 rounded-full transition-colors",
                isDarkMode ? "bg-primary/60" : "bg-primary/30"
              )}
            >
              <span
                className={cn(
                  "mt-[2px] block h-3 w-3 rounded-full bg-primary transition-transform",
                  isDarkMode ? "translate-x-[17px]" : "translate-x-[2px]"
                )}
              />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
