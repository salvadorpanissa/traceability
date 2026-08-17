import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SaleSettlementForm } from "@/components/activities/sale-settlement-form";

export default function SaleSettlementPage() {
  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Liquidaciones</CardTitle>
      </CardHeader>
      <CardContent>
        <SaleSettlementForm />
      </CardContent>
    </Card>
  );
}
