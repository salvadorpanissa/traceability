import { redirect } from "next/navigation";
import { SettingsSidebar } from "@/components/settings/settings-sidebar";
import { requireSession } from "@/lib/dal/session";
import { isAdmin } from "@/lib/dal/farm-access";

// Admin operates across every cliente's campo and doesn't have a campo of
// their own to configure — settings here (potreros, categorías, DICOSE,
// import, etc.) belong to a manager's specific campo, so admin never sees
// this section at all, not even by direct URL.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  if (isAdmin(session.user.role)) {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 md:flex-row">
      <SettingsSidebar />
      <div className="flex-1">{children}</div>
    </div>
  );
}
