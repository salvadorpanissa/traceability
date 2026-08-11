import type { Metadata } from "next";
import { requireSession } from "@/lib/dal/session";
import { isAdmin, listSelectableFarms } from "@/lib/dal/farm-access";
import { AppShell } from "@/components/app-shell";

export async function generateMetadata(): Promise<Metadata> {
  const session = await requireSession();
  if (isAdmin(session.user.role)) return { title: "Tracker · Admin" };

  const farms = await listSelectableFarms(session.user.id, session.user.role);
  if (farms.length === 0) return {};

  const farmNames = farms.map((f) => f.name).join(", ");
  return { title: `Tracker · ${farmNames}` };
}

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return <AppShell userName={session.user.name ?? session.user.email ?? ""}>{children}</AppShell>;
}
