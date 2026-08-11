import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthForm } from "@/components/activities/health-form";
import { listOwners } from "@/lib/dal/owner-catalog";
import { listSelectableFarms } from "@/lib/dal/farm-access";
import { requireSession } from "@/lib/dal/session";

export default async function HealthActivityPage() {
  const session = await requireSession();

  const [ownerCatalog, farms] = await Promise.all([
    listOwners(),
    listSelectableFarms(session.user.id, session.user.role),
  ]);

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Sanidad</CardTitle>
      </CardHeader>
      <CardContent>
        <HealthForm ownerCatalog={ownerCatalog} farms={farms} />
      </CardContent>
    </Card>
  );
}
