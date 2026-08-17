import { Card } from "@/components/ui/card";
import { DicoseRegistrationForm } from "@/components/settings/dicose-registration-form";
import { listDicoseRegistrations } from "@/lib/dal/dicose";
import { listOwnersByFarms } from "@/lib/dal/owner-catalog";
import {
  listSelectableEstablishments,
  listSelectableFarms,
} from "@/lib/dal/farm-access";
import { requireSession } from "@/lib/dal/session";

export default async function DicoseSettingsPage() {
  const session = await requireSession();
  const [registrations, farms, establishments] = await Promise.all([
    listDicoseRegistrations(session.user.id, session.user.role),
    listSelectableFarms(session.user.id, session.user.role),
    listSelectableEstablishments(session.user.id, session.user.role),
  ]);
  const owners = await listOwnersByFarms(farms.map((f) => f.id));

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <DicoseRegistrationForm
        registrations={registrations}
        owners={owners}
        establishments={establishments}
        farms={farms}
      />
    </Card>
  );
}
