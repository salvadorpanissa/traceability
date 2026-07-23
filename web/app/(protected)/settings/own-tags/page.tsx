import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OwnTagUploadForm } from "@/components/settings/own-tag-upload-form";
import { listOwnTagCounts } from "@/app/(protected)/settings/own-tags/actions";
import { listDicoseRegistrations } from "@/lib/dal/dicose-registration";
import { requireSession } from "@/lib/dal/session";

export default async function OwnTagsSettingsPage() {
  const session = await requireSession();
  const [registrations, counts] = await Promise.all([
    listDicoseRegistrations(session.user.id, session.user.role),
    listOwnTagCounts(),
  ]);

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Registrar caravanas propias</CardTitle>
      </CardHeader>
      <CardContent>
        <OwnTagUploadForm registrations={registrations} counts={counts} />
      </CardContent>
    </Card>
  );
}
