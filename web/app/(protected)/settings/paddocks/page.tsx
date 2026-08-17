import { Card } from "@/components/ui/card";
import { PaddockCatalogForm } from "@/components/settings/paddock-catalog-form";
import { listSelectableEstablishments } from "@/lib/dal/farm-access";
import { listPaddocksForEstablishments } from "@/lib/dal/paddock-catalog";
import { requireSession } from "@/lib/dal/session";

export default async function PaddocksSettingsPage() {
  const session = await requireSession();
  const establishments = await listSelectableEstablishments(
    session.user.id,
    session.user.role,
  );
  const paddocks = await listPaddocksForEstablishments(
    establishments.map((e) => e.id),
  );

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <PaddockCatalogForm paddocks={paddocks} establishments={establishments} />
    </Card>
  );
}
