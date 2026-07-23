import { requireSession } from "@/lib/dal/session";
import { AppShell } from "@/components/app-shell";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return <AppShell userName={session.user.name ?? session.user.email ?? ""}>{children}</AppShell>;
}
