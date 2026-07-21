"use client";

import { useEffect, useTransition } from "react";
import { useLocale } from "@/lib/i18n/context";

/**
 * Fires `onSelect` as a real Server Action invocation (via useTransition),
 * rather than calling it directly from a Server Component's render body.
 *
 * Next.js only allows `cookies().set()` inside an actual Server Action
 * invocation (a form submission or a client-triggered transition) — not a
 * plain function call made while a Server Component renders. Calling the
 * action directly from SSR render throws "Cookies can only be modified in a
 * Server Action or Route Handler."
 */
export function AutoSelectFarm({
  farmId,
  onSelect,
}: {
  farmId: string;
  onSelect: (farmId: string) => Promise<void>;
}) {
  const [, startTransition] = useTransition();
  const { t } = useLocale();

  useEffect(() => {
    startTransition(() => {
      onSelect(farmId);
    });
  }, [farmId, onSelect]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4 text-center">
      <p className="text-muted-foreground">{t("selectFarm.selecting")}</p>
    </div>
  );
}
