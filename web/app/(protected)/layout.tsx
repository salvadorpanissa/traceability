import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { farm } from "@/db/schema";
import { requireSession } from "@/lib/dal/session";
import { AppShell } from "@/components/app-shell";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const cookieStore = await cookies();
  const activeFarmId = cookieStore.get("active_farm_id")?.value;

  if (!activeFarmId) {
    redirect("/select-farm");
  }

  const [activeFarm] = await db.select({ id: farm.id, name: farm.name }).from(farm).where(eq(farm.id, activeFarmId));

  if (!activeFarm) {
    redirect("/select-farm");
  }

  return (
    <AppShell userName={session.user.name ?? session.user.email ?? ""} activeFarmName={activeFarm.name}>
      {children}
    </AppShell>
  );
}
