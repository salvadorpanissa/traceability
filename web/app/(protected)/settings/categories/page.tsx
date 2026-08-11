import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryCatalogForm } from "@/components/settings/category-catalog-form";
import { listAllCategoriesForGroups, countAliveAnimalsByCategory } from "@/lib/dal/category-catalog";
import { listSelectableFarms } from "@/lib/dal/farm-access";
import { requireSession } from "@/lib/dal/session";

export default async function CategoriesSettingsPage() {
  const session = await requireSession();
  const farms = await listSelectableFarms(session.user.id, session.user.role);
  const groupIds = [...new Set(farms.map((f) => f.groupId))];
  const [categories, animalCounts] = await Promise.all([
    listAllCategoriesForGroups(groupIds),
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
          farms={farms}
        />
      </CardContent>
    </Card>
  );
}
