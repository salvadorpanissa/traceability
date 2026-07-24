import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductCatalogForm } from "@/components/settings/product-catalog-form";
import { listProducts } from "@/lib/dal/product-catalog";
import { requireSession } from "@/lib/dal/session";

export default async function ProductsSettingsPage() {
  await requireSession();
  const products = await listProducts();

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Productos</CardTitle>
      </CardHeader>
      <CardContent>
        <ProductCatalogForm products={products} />
      </CardContent>
    </Card>
  );
}
