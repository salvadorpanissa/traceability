import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductCatalogForm } from "@/components/settings/product-catalog-form";
import { listProductsForFarms } from "@/lib/dal/product-catalog";
import { listSelectableEstablishments } from "@/lib/dal/farm-access";
import { requireSession } from "@/lib/dal/session";

export default async function ProductsSettingsPage() {
  const session = await requireSession();
  const establishments = await listSelectableEstablishments(session.user.id, session.user.role);
  const farmIds = [...new Set(establishments.map((e) => e.farmId))];
  const products = await listProductsForFarms(farmIds);

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Productos</CardTitle>
      </CardHeader>
      <CardContent>
        <ProductCatalogForm products={products} establishments={establishments} />
      </CardContent>
    </Card>
  );
}
