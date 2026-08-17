import { Card } from "@/components/ui/card";
import { ReproductiveStatusCatalogForm } from "@/components/settings/reproductive-status-catalog-form";
import { listAllReproductiveStatusesForFarms } from "@/lib/dal/reproductive-status-catalog";
import { listSelectableFarms } from "@/lib/dal/farm-access";
import { requireSession } from "@/lib/dal/session";

export default async function ReproductiveStatusSettingsPage() {
  const session = await requireSession();
  const farms = await listSelectableFarms(session.user.id, session.user.role);
  const farmIds = farms.map((f) => f.id);
  const statuses = await listAllReproductiveStatusesForFarms(farmIds);

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <ReproductiveStatusCatalogForm statuses={statuses} farms={farms} />
    </Card>
  );
}
