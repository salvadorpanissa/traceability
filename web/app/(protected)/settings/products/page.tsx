import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductCatalogForm } from "@/components/settings/product-catalog-form";
import { listProductsForGroups } from "@/lib/dal/product-catalog";
import { listSelectableFarms } from "@/lib/dal/farm-access";
import { requireSession } from "@/lib/dal/session";

export default async function ProductsSettingsPage() {
  const session = await requireSession();
  const farms = await listSelectableFarms(session.user.id, session.user.role);
  const groupIds = [...new Set(farms.map((f) => f.groupId))];
  const products = await listProductsForGroups(groupIds);

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Productos</CardTitle>
      </CardHeader>
      <CardContent>
        <ProductCatalogForm products={products} farms={farms} />
      </CardContent>
    </Card>
  );
}
