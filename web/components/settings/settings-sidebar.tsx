"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SettingsNavItem = { href: string; label: string };

const settingsNavItems: SettingsNavItem[] = [
  { href: "/settings/dicose", label: "DICOSE" },
  { href: "/settings/own-tags", label: "Caravanas propias" },
  { href: "/settings/products", label: "Productos" },
  { href: "/settings/paddocks", label: "Potreros" },
  { href: "/settings/categories", label: "Categorías" },
];

export function SettingsSidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="md:w-48 md:shrink-0">
      <Button
        type="button"
        variant="ghost"
        className="mb-2 gap-2 md:hidden"
        aria-expanded={isOpen}
        aria-controls="settings-navigation"
        onClick={() => setIsOpen((previous) => !previous)}
      >
        {isOpen ? <X /> : <Menu />}
        Configuración del campo
      </Button>

      <nav
        id="settings-navigation"
        aria-label="Configuración del campo"
        className={cn("flex-col gap-1 md:flex", isOpen ? "flex" : "hidden")}
      >
        {settingsNavItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              onClick={() => setIsOpen(false)}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive ? "bg-muted text-foreground" : "text-muted-foreground"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
