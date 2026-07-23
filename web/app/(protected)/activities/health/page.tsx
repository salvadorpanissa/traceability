import { cookies } from "next/headers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthForm } from "@/components/activities/health-form";
import { listProducts } from "@/lib/dal/product-catalog";
import { listOwners } from "@/lib/dal/owner-catalog";
import { listPaddocksByFarm } from "@/lib/dal/paddock-catalog";

export default async function HealthActivityPage() {
  const cookieStore = await cookies();
  const activeFarmId = cookieStore.get("active_farm_id")?.value;

  const [catalog, ownerCatalog, paddocks] = await Promise.all([
    listProducts(),
    listOwners(),
    activeFarmId ? listPaddocksByFarm(activeFarmId) : Promise.resolve([]),
  ]);

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Sanidad</CardTitle>
      </CardHeader>
      <CardContent>
        <HealthForm catalog={catalog} ownerCatalog={ownerCatalog} paddocks={paddocks} />
      </CardContent>
    </Card>
  );
}
