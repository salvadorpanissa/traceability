import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryCatalogForm } from "@/components/settings/category-catalog-form";
import { listAllCategoriesForFarms, countAliveAnimalsByCategory } from "@/lib/dal/category-catalog";
import { listSelectableEstablishments } from "@/lib/dal/farm-access";
import { requireSession } from "@/lib/dal/session";

export default async function CategoriesSettingsPage() {
  const session = await requireSession();
  const establishments = await listSelectableEstablishments(session.user.id, session.user.role);
  const farmIds = [...new Set(establishments.map((e) => e.farmId))];
  const [categories, animalCounts] = await Promise.all([
    listAllCategoriesForFarms(farmIds),
    countAliveAnimalsByCategory(),
  ]);

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Categorías</CardTitle>
      </CardHeader>
      <CardContent>
        <CategoryCatalogForm
          categories={categories}
          animalCounts={Object.fromEntries(animalCounts)}
          establishments={establishments}
        />
      </CardContent>
    </Card>
  );
}
