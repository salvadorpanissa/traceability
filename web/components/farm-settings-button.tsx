"use client";

import Link from "next/link";
import { Cog, Warehouse } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

export function FarmSettingsButton({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useLocale();

  return (
    <Link
      href="/settings"
      aria-label={t("appShell.navEstablishmentSettings")}
      onClick={onNavigate}
      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "px-2")}
    >
      <span className="relative inline-flex size-4 shrink-0">
        <Warehouse className="size-4" />
        <span className="absolute -right-1 -bottom-1 flex size-2 items-center justify-center rounded-full bg-background">
          <Cog className="size-3 stroke-2" />
        </span>
      </span>
    </Link>
  );
}
