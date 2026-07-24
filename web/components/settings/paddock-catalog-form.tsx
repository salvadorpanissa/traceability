"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPaddockAction, updatePaddockAction } from "@/app/(protected)/settings/paddocks/actions";
import type { PaddockCatalogEntry } from "@/lib/dal/paddock-catalog";

type Farm = { id: string; name: string };

export function PaddockCatalogForm({
  paddocks: initialPaddocks,
  farms,
}: {
  paddocks: PaddockCatalogEntry[];
  farms: Farm[];
}) {
  const [paddocks, setPaddocks] = useState(initialPaddocks);
  const farmNameById = new Map(farms.map((f) => [f.id, f.name]));

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const [farmId, setFarmId] = useState(farms.length === 1 ? farms[0].id : "");
  const [name, setName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  function startEdit(entry: PaddockCatalogEntry) {
    setEditingId(entry.id);
    setEditName(entry.name);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(id: string) {
    if (!editName) return;
    const result = await updatePaddockAction({ id, name: editName });
    if (!result.ok) {
      setEditError(result.error);
      return;
    }
    setPaddocks((prev) => prev.map((p) => (p.id === id ? result.entry : p)));
    setEditingId(null);
  }

  async function handleCreate() {
    if (!farmId || !name) return;
    const result = await createPaddockAction({ farmId, name });
    if (!result.ok) {
      setCreateError(result.error);
      return;
    }
    setPaddocks((prev) => [...prev, result.entry]);
    setName("");
    setCreateError(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1 pr-2">Nombre</th>
            <th className="py-1 pr-2">Campo</th>
            <th className="py-1 pr-2" />
          </tr>
        </thead>
        <tbody>
          {paddocks.map((entry) =>
            editingId === entry.id ? (
              <tr key={entry.id} className="border-b last:border-0">
                <td className="py-1 pr-2">
                  <Input aria-label="Editar nombre" value={editName} onChange={(e) => setEditName(e.target.value)} />
                </td>
                <td className="py-1 pr-2">{farmNameById.get(entry.farmId) ?? ""}</td>
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
                <td className="py-1 pr-2">{farmNameById.get(entry.farmId) ?? ""}</td>
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
        <Label htmlFor="paddock-farm">Campo</Label>
        <select
          id="paddock-farm"
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

        <Label htmlFor="paddock-name">Nombre</Label>
        <Input id="paddock-name" value={name} onChange={(e) => setName(e.target.value)} />

        {farms.length === 0 ? <p className="text-sm text-muted-foreground">No tenés campos asociados</p> : null}
        {createError ? <p className="text-sm text-destructive">{createError}</p> : null}

        <Button type="button" disabled={!farmId || !name} onClick={handleCreate}>
          Agregar
        </Button>
      </div>
    </div>
  );
}
