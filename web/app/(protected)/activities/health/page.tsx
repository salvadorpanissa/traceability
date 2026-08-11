import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthForm } from "@/components/activities/health-form";
import { listOwners } from "@/lib/dal/owner-catalog";
import { listSelectableEstablishments } from "@/lib/dal/farm-access";
import { requireSession } from "@/lib/dal/session";

export default async function HealthActivityPage() {
  const session = await requireSession();

  const [ownerCatalog, establishments] = await Promise.all([
    listOwners(),
    listSelectableEstablishments(session.user.id, session.user.role),
  ]);

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Sanidad</CardTitle>
      </CardHeader>
      <CardContent>
        <HealthForm ownerCatalog={ownerCatalog} establishments={establishments} />
      </CardContent>
    </Card>
  );
}
