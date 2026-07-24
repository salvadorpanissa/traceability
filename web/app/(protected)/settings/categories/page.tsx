import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryCatalogForm } from "@/components/settings/category-catalog-form";
import { listCategories } from "@/lib/dal/category-catalog";
import { requireSession } from "@/lib/dal/session";

export default async function CategoriesSettingsPage() {
  await requireSession();
  const categories = await listCategories();

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Categorías</CardTitle>
      </CardHeader>
      <CardContent>
        <CategoryCatalogForm categories={categories} />
      </CardContent>
    </Card>
  );
}
