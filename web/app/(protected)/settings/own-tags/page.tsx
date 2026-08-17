import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tip } from "@/components/ui/tip";
import { OwnTagUploadForm } from "@/components/settings/own-tag-upload-form";
import { listOwnTagCounts } from "@/app/(protected)/settings/own-tags/actions";
import { listDicoseRegistrations } from "@/lib/dal/dicose";
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
      <CardContent className="flex flex-col gap-4">
        <Tip>
          Puede registrar acá sus caravanas propias aunque todavía no estén asignadas a ningún
          animal. Quedan disponibles en el sistema y se vinculan automáticamente al animal
          correspondiente en el momento en que esa caravana se use por primera vez en una
          actividad.
        </Tip>
        <OwnTagUploadForm registrations={registrations} counts={counts} />
      </CardContent>
    </Card>
  );
}
