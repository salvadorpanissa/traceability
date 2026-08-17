import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SaleForm } from "@/components/activities/sale-form";

export default function SalePage() {
  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Venta</CardTitle>
      </CardHeader>
      <CardContent>
        <SaleForm />
      </CardContent>
    </Card>
  );
}
