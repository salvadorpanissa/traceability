import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecategorizeForm } from "@/components/activities/recategorize-form";
import { listCategories } from "@/lib/dal/category-catalog";
import { requireSession } from "@/lib/dal/session";

export default async function RecategorizeActivityPage() {
  await requireSession();
  const categories = await listCategories();

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Recategorización</CardTitle>
      </CardHeader>
      <CardContent>
        <RecategorizeForm categories={categories} />
      </CardContent>
    </Card>
  );
}
