"use client";

import { Button } from "@/components/ui/button";
import { logoutAction } from "@/lib/actions/logout";
import { useLocale } from "@/lib/i18n/context";

export function LogoutButton() {
  const { t } = useLocale();

  return (
    <form action={logoutAction}>
      <Button type="submit" variant="ghost">
        {t("appShell.logout")}
      </Button>
    </form>
  );
}
