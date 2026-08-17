import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthForm } from "@/components/activities/health-form";
import { listOwnersByFarms } from "@/lib/dal/owner-catalog";
import { listSelectableEstablishments, listSelectableFarms } from "@/lib/dal/farm-access";
import { requireSession } from "@/lib/dal/session";

export default async function HealthActivityPage() {
  const session = await requireSession();

  const [farms, establishments] = await Promise.all([
    listSelectableFarms(session.user.id, session.user.role),
    listSelectableEstablishments(session.user.id, session.user.role),
  ]);
  const ownerCatalog = await listOwnersByFarms(farms.map((f) => f.id));

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
