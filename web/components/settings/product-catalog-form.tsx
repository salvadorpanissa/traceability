"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProductAction, updateProductAction } from "@/app/(protected)/settings/products/actions";
import type { ProductCatalogEntry } from "@/lib/dal/product-catalog";

type Farm = { id: string; name: string };

export function ProductCatalogForm({
  products: initialProducts,
  farms,
}: {
  products: ProductCatalogEntry[];
  farms: Farm[];
}) {
  const [products, setProducts] = useState(initialProducts);
  const farmLabels = new Map(farms.map((f) => [f.id, f.name]));
  const showFarmColumn = farms.length > 1;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDose, setEditDose] = useState("");
  const [editDoseUnit, setEditDoseUnit] = useState("");
  const [editRoute, setEditRoute] = useState("");
  const [editWithdrawalDays, setEditWithdrawalDays] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [farmId, setFarmId] = useState(farms.length === 1 ? farms[0].id : "");
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [doseUnit, setDoseUnit] = useState("");
  const [route, setRoute] = useState("");
  const [withdrawalDays, setWithdrawalDays] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  function startEdit(entry: ProductCatalogEntry) {
    setEditingId(entry.id);
    setEditName(entry.name);
    setEditDose(entry.defaultDose ?? "");
    setEditDoseUnit(entry.defaultDoseUnit ?? "");
    setEditRoute(entry.defaultRoute ?? "");
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
      defaultDose: editDose || null,
      defaultDoseUnit: editDoseUnit || null,
      defaultRoute: editRoute || null,
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
    if (!farmId || !name) return;
    const result = await createProductAction({
      farmId,
      name,
      defaultDose: dose || null,
      defaultDoseUnit: doseUnit || null,
      defaultRoute: route || null,
      defaultWithdrawalDays: withdrawalDays ? Number(withdrawalDays) : null,
    });
    if (!result.ok) {
      setCreateError(result.error);
      return;
    }
    setProducts((prev) => [...prev, result.entry]);
    setName("");
    setDose("");
    setDoseUnit("");
    setRoute("");
    setWithdrawalDays("");
    setCreateError(null);
    setCreateOpen(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button type="button" />}>+ Agregar</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo producto</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              {farms.length > 1 ? (
                <>
                  <Label htmlFor="product-farm">Campo</Label>
                  <select
                    id="product-farm"
                    value={farmId}
                    onChange={(e) => setFarmId(e.target.value)}
                    className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
                  >
                    <option value="">Elegir...</option>
                    {farms.map((farm) => (
                      <option key={farm.id} value={farm.id}>
                        {farm.name}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}

              <Label htmlFor="product-name">Nombre</Label>
              <Input id="product-name" value={name} onChange={(e) => setName(e.target.value)} />

              <Label htmlFor="product-dose">Dosis</Label>
              <Input id="product-dose" value={dose} onChange={(e) => setDose(e.target.value)} />

              <Label htmlFor="product-dose-unit">Unidad de dosis</Label>
              <Input id="product-dose-unit" value={doseUnit} onChange={(e) => setDoseUnit(e.target.value)} />

              <Label htmlFor="product-route">Vía</Label>
              <Input id="product-route" value={route} onChange={(e) => setRoute(e.target.value)} />

              <Label htmlFor="product-withdrawal-days">Días de retiro</Label>
              <Input
                id="product-withdrawal-days"
                type="number"
                value={withdrawalDays}
                onChange={(e) => setWithdrawalDays(e.target.value)}
              />

              {createError ? <p className="text-sm text-destructive">{createError}</p> : null}

              <Button type="button" disabled={!farmId || !name} onClick={handleCreate}>
                Agregar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1 pr-2">Nombre</th>
            <th className="py-1 pr-2">Dosis</th>
            <th className="py-1 pr-2">Unidad de dosis</th>
            <th className="py-1 pr-2">Vía</th>
            <th className="py-1 pr-2">Días de retiro</th>
            {showFarmColumn ? <th className="py-1 pr-2">Campo</th> : null}
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
                  <Input aria-label="Editar dosis" value={editDose} onChange={(e) => setEditDose(e.target.value)} />
                </td>
                <td className="py-1 pr-2">
                  <Input
                    aria-label="Editar unidad de dosis"
                    value={editDoseUnit}
                    onChange={(e) => setEditDoseUnit(e.target.value)}
                  />
                </td>
                <td className="py-1 pr-2">
                  <Input aria-label="Editar vía" value={editRoute} onChange={(e) => setEditRoute(e.target.value)} />
                </td>
                <td className="py-1 pr-2">
                  <Input
                    aria-label="Editar días de retiro"
                    type="number"
                    value={editWithdrawalDays}
                    onChange={(e) => setEditWithdrawalDays(e.target.value)}
                  />
                </td>
                {showFarmColumn ? <td className="py-1 pr-2">{farmLabels.get(entry.farmId) ?? ""}</td> : null}
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
                <td className="py-1 pr-2">{entry.defaultDose ?? "—"}</td>
                <td className="py-1 pr-2">{entry.defaultDoseUnit ?? "—"}</td>
                <td className="py-1 pr-2">{entry.defaultRoute ?? "—"}</td>
                <td className="py-1 pr-2">{entry.defaultWithdrawalDays ?? "—"}</td>
                {showFarmColumn ? <td className="py-1 pr-2">{farmLabels.get(entry.farmId) ?? ""}</td> : null}
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
    </div>
  );
}
