import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DicoseRegistrationForm } from "@/components/settings/dicose-registration-form";
import { listDicoseRegistrations } from "@/lib/dal/dicose-registration";
import { listOwners } from "@/lib/dal/owner-catalog";
import { listFarms } from "@/app/(protected)/settings/dicose/actions";

export default async function DicoseSettingsPage() {
  const [registrations, owners, farms] = await Promise.all([listDicoseRegistrations(), listOwners(), listFarms()]);

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Registrar DICOSE</CardTitle>
      </CardHeader>
      <CardContent>
        <DicoseRegistrationForm registrations={registrations} owners={owners} farms={farms} />
      </CardContent>
    </Card>
  );
}
