import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthForm } from "@/components/activities/health-form";
import { listProducts } from "@/lib/dal/product-catalog";

export default async function HealthActivityPage() {
  const catalog = await listProducts();

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Sanidad</CardTitle>
      </CardHeader>
      <CardContent>
        <HealthForm catalog={catalog} />
      </CardContent>
    </Card>
  );
}
