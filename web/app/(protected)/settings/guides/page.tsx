import { cookies } from "next/headers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { parseLocaleCookie } from "@/lib/i18n/dictionaries";
import { requireSession } from "@/lib/dal/session";
import { listGuideDocuments } from "@/lib/dal/guide-documents";
import { GuideDocumentsTable } from "@/components/settings/guide-documents-table";

export default async function GuidesSettingsPage() {
  const cookieStore = await cookies();
  const locale = parseLocaleCookie(cookieStore.get("locale")?.value);

  const session = await requireSession();
  const guides = await listGuideDocuments(session.user.id, session.user.role);

  return (
    <Card className="mx-auto w-full max-w-3xl">
      <CardHeader>
        <CardTitle>Guías</CardTitle>
      </CardHeader>
      <CardContent>
        <GuideDocumentsTable rows={guides} locale={locale} />
      </CardContent>
    </Card>
  );
}
