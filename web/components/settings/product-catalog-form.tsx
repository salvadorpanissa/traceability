"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProductAction, updateProductAction } from "@/app/(protected)/settings/products/actions";
import type { ProductCatalogEntry } from "@/lib/dal/product-catalog";

export function ProductCatalogForm({ products: initialProducts }: { products: ProductCatalogEntry[] }) {
  const [products, setProducts] = useState(initialProducts);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDoseUnit, setEditDoseUnit] = useState("");
  const [editWithdrawalDays, setEditWithdrawalDays] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [doseUnit, setDoseUnit] = useState("");
  const [withdrawalDays, setWithdrawalDays] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  function startEdit(entry: ProductCatalogEntry) {
    setEditingId(entry.id);
    setEditName(entry.name);
    setEditDoseUnit(entry.defaultDoseUnit ?? "");
    setEditWithdrawalDays(entry.defaultWithdrawalDays?.toString() ?? "");
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(id: string) {
    if (!editName) return;
    const result = await updateProductAction({
      id,
      name: editName,
      defaultDoseUnit: editDoseUnit || null,
      defaultWithdrawalDays: editWithdrawalDays ? Number(editWithdrawalDays) : null,
    });
    if (!result.ok) {
      setEditError(result.error);
      return;
    }
    setProducts((prev) => prev.map((p) => (p.id === id ? result.entry : p)));
    setEditingId(null);
  }

  async function handleCreate() {
    if (!name) return;
    const result = await createProductAction({
      name,
      defaultDoseUnit: doseUnit || null,
      defaultWithdrawalDays: withdrawalDays ? Number(withdrawalDays) : null,
    });
    if (!result.ok) {
      setCreateError(result.error);
      return;
    }
    setProducts((prev) => [...prev, result.entry]);
    setName("");
    setDoseUnit("");
    setWithdrawalDays("");
    setCreateError(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1 pr-2">Nombre</th>
            <th className="py-1 pr-2">Unidad de dosis</th>
            <th className="py-1 pr-2">Días de retiro</th>
            <th className="py-1 pr-2" />
          </tr>
        </thead>
        <tbody>
          {products.map((entry) =>
            editingId === entry.id ? (
              <tr key={entry.id} className="border-b last:border-0">
                <td className="py-1 pr-2">
                  <Input aria-label="Editar nombre" value={editName} onChange={(e) => setEditName(e.target.value)} />
                </td>
                <td className="py-1 pr-2">
                  <Input
                    aria-label="Editar unidad de dosis"
                    value={editDoseUnit}
                    onChange={(e) => setEditDoseUnit(e.target.value)}
                  />
                </td>
                <td className="py-1 pr-2">
                  <Input
                    aria-label="Editar días de retiro"
                    type="number"
                    value={editWithdrawalDays}
                    onChange={(e) => setEditWithdrawalDays(e.target.value)}
                  />
                </td>
                <td className="flex gap-1 py-1 pr-2">
                  <Button type="button" size="sm" disabled={!editName} onClick={() => saveEdit(entry.id)}>
                    Guardar
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={cancelEdit}>
                    Cancelar
                  </Button>
                </td>
              </tr>
            ) : (
              <tr key={entry.id} className="border-b last:border-0">
                <td className="py-1 pr-2">{entry.name}</td>
                <td className="py-1 pr-2">{entry.defaultDoseUnit ?? "—"}</td>
                <td className="py-1 pr-2">{entry.defaultWithdrawalDays ?? "—"}</td>
                <td className="py-1 pr-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => startEdit(entry)}>
                    Editar
                  </Button>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
      {editError ? <p className="text-sm text-destructive">{editError}</p> : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="product-name">Nombre</Label>
        <Input id="product-name" value={name} onChange={(e) => setName(e.target.value)} />

        <Label htmlFor="product-dose-unit">Unidad de dosis</Label>
        <Input id="product-dose-unit" value={doseUnit} onChange={(e) => setDoseUnit(e.target.value)} />

        <Label htmlFor="product-withdrawal-days">Días de retiro</Label>
        <Input
          id="product-withdrawal-days"
          type="number"
          value={withdrawalDays}
          onChange={(e) => setWithdrawalDays(e.target.value)}
        />

        {createError ? <p className="text-sm text-destructive">{createError}</p> : null}

        <Button type="button" disabled={!name} onClick={handleCreate}>
          Agregar
        </Button>
      </div>
    </div>
  );
}
