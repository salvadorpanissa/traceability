"use client";

import { usePathname } from "next/navigation";
import { AppLogo } from "@/components/app-logo";

export function BackgroundLogo() {
  const pathname = usePathname();
  if (pathname?.startsWith("/onboarding")) return null;

  return (
    <AppLogo className="pointer-events-none fixed inset-0 -z-10 m-auto size-[110vmin] opacity-5 dark:opacity-10" />
  );
}
