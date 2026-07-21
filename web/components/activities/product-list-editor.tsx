"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProductCatalogEntry } from "@/lib/dal/product-catalog";
import type { HealthProduct } from "@/lib/activities/health";

function emptyProduct(): HealthProduct {
  return { productId: "", dose: "", doseUnit: "", route: "", withdrawalDays: null, notes: null };
}

export function ProductListEditor({
  catalog,
  products,
  onChange,
}: {
  catalog: ProductCatalogEntry[];
  products: HealthProduct[];
  onChange: (products: HealthProduct[]) => void;
}) {
  function updateRow(index: number, patch: Partial<HealthProduct>) {
    onChange(products.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function selectProduct(index: number, productId: string) {
    const catalogEntry = catalog.find((c) => c.id === productId);
    const current = products[index];
    updateRow(index, {
      productId,
      doseUnit: current.doseUnit || catalogEntry?.defaultDoseUnit || "",
      withdrawalDays: current.withdrawalDays ?? catalogEntry?.defaultWithdrawalDays ?? null,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {products.map((productRow, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`product-${index}`}>Producto</Label>
            <select
              id={`product-${index}`}
              aria-label="Producto"
              value={productRow.productId}
              onChange={(e) => selectProduct(index, e.target.value)}
              className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
            >
              <option value="">Elegir producto</option>
              {catalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`dose-${index}`}>Dosis</Label>
            <Input
              id={`dose-${index}`}
              value={productRow.dose}
              onChange={(e) => updateRow(index, { dose: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`unit-${index}`}>Unidad</Label>
            <Input
              id={`unit-${index}`}
              aria-label="Unidad"
              value={productRow.doseUnit}
              onChange={(e) => updateRow(index, { doseUnit: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`route-${index}`}>Vía</Label>
            <Input
              id={`route-${index}`}
              value={productRow.route}
              onChange={(e) => updateRow(index, { route: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`withdrawal-${index}`}>Carencia (días)</Label>
            <Input
              id={`withdrawal-${index}`}
              aria-label="Carencia"
              type="number"
              value={productRow.withdrawalDays ?? ""}
              onChange={(e) => updateRow(index, { withdrawalDays: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={products.length === 1}
            onClick={() => onChange(products.filter((_, i) => i !== index))}
          >
            Quitar
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={() => onChange([...products, emptyProduct()])}>
        + Agregar producto
      </Button>
    </div>
  );
}

export { emptyProduct };
