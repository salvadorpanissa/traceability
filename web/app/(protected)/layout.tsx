import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/dal/session";
import { resolveActiveFarm } from "@/lib/dal/active-farm";
import { AppShell } from "@/components/app-shell";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const cookieStore = await cookies();
  const activeFarmId = cookieStore.get("active_farm_id")?.value;

  if (!activeFarmId) {
    redirect("/select-farm");
  }

  const activeFarm = await resolveActiveFarm(session.user.id, session.user.role, activeFarmId);

  if (!activeFarm) {
    redirect("/select-farm");
  }

  return (
    <AppShell userName={session.user.name ?? session.user.email ?? ""} activeFarmName={activeFarm.name}>
      {children}
    </AppShell>
  );
}
