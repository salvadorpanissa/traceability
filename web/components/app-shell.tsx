"use client";

import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { useLocale } from "@/lib/i18n/context";

export function AppShell({
  userName,
  activeFarmName,
  children,
}: {
  userName: string;
  activeFarmName: string;
  children: React.ReactNode;
}) {
  const { t } = useLocale();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="font-semibold">{activeFarmName}</span>
        <div className="flex items-center gap-4">
          <Link href="/select-farm" className="text-sm underline">
            {t("appShell.changeFarm")}
          </Link>
          <span className="text-sm">{userName}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
