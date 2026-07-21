"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun, SunMoon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/context";
import { locales, type Locale } from "@/lib/i18n/dictionaries";

const THEME_ICONS = { light: Sun, dark: Moon, system: SunMoon } as const;

export function SettingsMenu() {
  const { locale, setLocale, t } = useLocale();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const cycleTheme = () => {
    const order = ["light", "dark", "system"] as const;
    const current = order.includes(theme as (typeof order)[number]) ? (theme as (typeof order)[number]) : "system";
    const next = order[(order.indexOf(current) + 1) % order.length];
    setTheme(next);
  };

  // Server always renders the "system" icon; the real theme is only known
  // after mount (next-themes reads it from localStorage), so swap in the
  // resolved icon post-hydration to avoid a server/client mismatch.
  const ThemeIcon = mounted ? THEME_ICONS[(theme as keyof typeof THEME_ICONS) ?? "system"] ?? SunMoon : SunMoon;

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label={t("settings.language")}
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
      >
        {locales.map((value) => (
          <option key={value} value={value}>
            {value.toUpperCase()}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t("settings.theme")}
        onClick={cycleTheme}
      >
        <ThemeIcon />
      </Button>
    </div>
  );
}
