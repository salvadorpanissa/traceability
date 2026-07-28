import { SaleSettlementForm } from "@/components/activities/sale-settlement-form";

export default function SaleSettlementPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Liquidaciones</h1>
      <SaleSettlementForm />
    </div>
  );
}
