import { Card } from "@/components/ui/card";
import { ProductCatalogForm } from "@/components/settings/product-catalog-form";
import { listProductsForFarms } from "@/lib/dal/product-catalog";
import { listSelectableFarms } from "@/lib/dal/farm-access";
import { requireSession } from "@/lib/dal/session";

export default async function ProductsSettingsPage() {
  const session = await requireSession();
  const farms = await listSelectableFarms(session.user.id, session.user.role);
  const farmIds = farms.map((f) => f.id);
  const products = await listProductsForFarms(farmIds);

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <ProductCatalogForm products={products} farms={farms} />
    </Card>
  );
}
