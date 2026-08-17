import { Card } from "@/components/ui/card";
import { CategoryCatalogForm } from "@/components/settings/category-catalog-form";
import {
  listAllCategoriesForFarms,
  countAliveAnimalsByCategory,
} from "@/lib/dal/category-catalog";
import { listSelectableFarms } from "@/lib/dal/farm-access";
import { requireSession } from "@/lib/dal/session";

export default async function CategoriesSettingsPage() {
  const session = await requireSession();
  const farms = await listSelectableFarms(session.user.id, session.user.role);
  const farmIds = farms.map((f) => f.id);
  const [categories, animalCounts] = await Promise.all([
    listAllCategoriesForFarms(farmIds),
    countAliveAnimalsByCategory(),
  ]);

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CategoryCatalogForm
        categories={categories}
        animalCounts={Object.fromEntries(animalCounts)}
        farms={farms}
      />
    </Card>
  );
}
