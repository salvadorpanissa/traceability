"use client";

import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { useLocale } from "@/lib/i18n/context";

type FarmOption = { id: string; name: string };

export function AppShell({
  userName,
  activeFarmId,
  activeFarmName,
  selectableFarms,
  onFarmChange,
  children,
}: {
  userName: string;
  activeFarmId: string;
  activeFarmName: string;
  selectableFarms: FarmOption[];
  onFarmChange: (formData: FormData) => Promise<void>;
  children: React.ReactNode;
}) {
  const { t } = useLocale();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <Link href="/dashboard" className="text-lg font-bold">
          {t("app.title")}
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold">{activeFarmName}</span>
          <form action={onFarmChange}>
            <label className="sr-only" htmlFor="active-farm-select">
              {t("appShell.changeFarm")}
            </label>
            <select
              id="active-farm-select"
              name="farmId"
              defaultValue={activeFarmId}
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
              className="h-8 rounded border bg-background px-2 text-sm"
            >
              {selectableFarms.map((farm) => (
                <option key={farm.id} value={farm.id}>
                  {farm.name}
                </option>
              ))}
            </select>
          </form>
          <details className="group relative">
            <summary className="list-none cursor-pointer text-sm [&::-webkit-details-marker]:hidden">
              {userName}
            </summary>
            <div className="absolute right-0 z-10 mt-2 min-w-40 rounded-md border bg-background p-1 shadow-md group-open:block">
              <LogoutButton className="w-full justify-start" />
            </div>
          </details>
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
