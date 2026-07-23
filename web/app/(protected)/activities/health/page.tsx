import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthForm } from "@/components/activities/health-form";
import { listProducts } from "@/lib/dal/product-catalog";
import { listOwners } from "@/lib/dal/owner-catalog";
import { listSelectableFarms } from "@/lib/dal/farm-access";
import { listPaddocksForFarms } from "@/lib/dal/paddock-catalog";
import { requireSession } from "@/lib/dal/session";

export default async function HealthActivityPage() {
  const session = await requireSession();

  const [catalog, ownerCatalog, farms] = await Promise.all([
    listProducts(),
    listOwners(),
    listSelectableFarms(session.user.id, session.user.role),
  ]);
  const paddocks = await listPaddocksForFarms(farms.map((f) => f.id));

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Sanidad</CardTitle>
      </CardHeader>
      <CardContent>
        <HealthForm catalog={catalog} ownerCatalog={ownerCatalog} farms={farms} paddocks={paddocks} />
      </CardContent>
    </Card>
  );
}
