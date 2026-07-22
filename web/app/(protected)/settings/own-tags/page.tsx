import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OwnTagUploadForm } from "@/components/settings/own-tag-upload-form";
import { listOwnTagCounts } from "@/app/(protected)/settings/own-tags/actions";
import { listDicoseRegistrations } from "@/lib/dal/dicose-registration";

export default async function OwnTagsSettingsPage() {
  const [registrations, counts] = await Promise.all([listDicoseRegistrations(), listOwnTagCounts()]);

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Caravanas propias</CardTitle>
      </CardHeader>
      <CardContent>
        <OwnTagUploadForm registrations={registrations} counts={counts} />
      </CardContent>
    </Card>
  );
}
