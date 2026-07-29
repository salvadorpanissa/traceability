import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImportForm } from "@/components/settings/import-form";
import { requireSession } from "@/lib/dal/session";
import { isAdmin } from "@/lib/dal/farm-access";

export default async function ImportSettingsPage() {
  const session = await requireSession();
  if (!isAdmin(session.user.role)) {
    redirect("/settings");
  }

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Importar caravanas existentes</CardTitle>
      </CardHeader>
      <CardContent>
        <ImportForm />
      </CardContent>
    </Card>
  );
}
