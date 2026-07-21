"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProductCatalogEntry } from "@/lib/dal/product-catalog";
import type { HealthProduct } from "@/lib/activities/health";

const CREATE_NEW_VALUE = "__create_new__";

function emptyProduct(): HealthProduct {
  return { productId: "", dose: "", doseUnit: "", route: "", withdrawalDays: null, notes: null };
}

export function ProductListEditor({
  catalog,
  products,
  suggestedNames,
  onChange,
  onCreateProduct,
}: {
  catalog: ProductCatalogEntry[];
  products: HealthProduct[];
  suggestedNames?: (string | null)[];
  onChange: (products: HealthProduct[]) => void;
  onCreateProduct: (name: string) => Promise<ProductCatalogEntry>;
}) {
  const [creatingRow, setCreatingRow] = useState<number | null>(null);
  const [newProductNameByRow, setNewProductNameByRow] = useState<Record<number, string>>({});
  const [createErrorByRow, setCreateErrorByRow] = useState<Record<number, string>>({});
  // Tracked locally so a just-created product shows up as a selectable
  // <option> immediately, even before the parent (which owns the real
  // catalog and may re-fetch/re-sort it) re-renders this component with an
  // updated `catalog` prop.
  const [locallyCreatedProducts, setLocallyCreatedProducts] = useState<ProductCatalogEntry[]>([]);
  const visibleCatalog = [
    ...catalog,
    ...locallyCreatedProducts.filter((created) => !catalog.some((c) => c.id === created.id)),
  ];

  function updateRow(index: number, patch: Partial<HealthProduct>) {
    onChange(products.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function selectProduct(index: number, value: string) {
    if (value === CREATE_NEW_VALUE) {
      setCreatingRow(index);
      setNewProductNameByRow((prev) => ({ ...prev, [index]: prev[index] ?? suggestedNames?.[index] ?? "" }));
      return;
    }
    setCreatingRow(null);
    const catalogEntry = visibleCatalog.find((c) => c.id === value);
    const current = products[index];
    updateRow(index, {
      productId: value,
      doseUnit: current.doseUnit || catalogEntry?.defaultDoseUnit || "",
      withdrawalDays: current.withdrawalDays ?? catalogEntry?.defaultWithdrawalDays ?? null,
    });
  }

  async function handleCreateProduct(index: number) {
    const name = (newProductNameByRow[index] ?? "").trim();
    if (!name) return;
    setCreateErrorByRow((prev) => ({ ...prev, [index]: "" }));
    try {
      const created = await onCreateProduct(name);
      setLocallyCreatedProducts((prev) => [...prev, created]);
      const current = products[index];
      updateRow(index, {
        productId: created.id,
        doseUnit: current.doseUnit || created.defaultDoseUnit || "",
        withdrawalDays: current.withdrawalDays ?? created.defaultWithdrawalDays ?? null,
      });
      setCreatingRow(null);
    } catch (error) {
      setCreateErrorByRow((prev) => ({
        ...prev,
        [index]: error instanceof Error ? error.message : "No se pudo crear el producto",
      }));
    }
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
              {visibleCatalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value={CREATE_NEW_VALUE}>+ Crear producto nuevo</option>
            </select>
          </div>
          {creatingRow === index ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`new-product-name-${index}`}>Nombre del producto nuevo</Label>
              <Input
                id={`new-product-name-${index}`}
                aria-label="Nombre del producto nuevo"
                value={newProductNameByRow[index] ?? ""}
                onChange={(e) => setNewProductNameByRow((prev) => ({ ...prev, [index]: e.target.value }))}
              />
              <Button type="button" size="sm" onClick={() => handleCreateProduct(index)}>
                Crear
              </Button>
              {createErrorByRow[index] ? (
                <p className="text-sm text-red-600">{createErrorByRow[index]}</p>
              ) : null}
            </div>
          ) : null}
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
