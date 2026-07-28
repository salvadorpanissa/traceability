import { SaleForm } from "@/components/activities/sale-form";

export default function SalePage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Venta</h1>
      <SaleForm />
    </div>
  );
}
