import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaddockCatalogForm } from "@/components/settings/paddock-catalog-form";
import { listSelectableFarms } from "@/lib/dal/farm-access";
import { listPaddocksForFarms } from "@/lib/dal/paddock-catalog";
import { requireSession } from "@/lib/dal/session";

export default async function PaddocksSettingsPage() {
  const session = await requireSession();
  const farms = await listSelectableFarms(session.user.id, session.user.role);
  const paddocks = await listPaddocksForFarms(farms.map((f) => f.id));

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Potreros</CardTitle>
      </CardHeader>
      <CardContent>
        <PaddockCatalogForm paddocks={paddocks} farms={farms} />
      </CardContent>
    </Card>
  );
}
