"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

export function AppLogo({ className = "size-5 shrink-0" }: { className?: string }) {
  const { resolvedTheme } = useTheme();
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const isDarkMode = isClient && resolvedTheme === "dark";

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={isDarkMode ? "/logo-white.svg" : "/logo-black.svg"} alt="" className={className} />
  );
}
