"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPaddockAction, updatePaddockAction } from "@/app/(protected)/settings/paddocks/actions";
import type { PaddockCatalogEntry } from "@/lib/dal/paddock-catalog";

type Establishment = { id: string; name: string };

export function PaddockCatalogForm({
  paddocks: initialPaddocks,
  establishments,
}: {
  paddocks: PaddockCatalogEntry[];
  establishments: Establishment[];
}) {
  const [paddocks, setPaddocks] = useState(initialPaddocks);
  const establishmentNameById = new Map(establishments.map((e) => [e.id, e.name]));

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [establishmentId, setEstablishmentId] = useState(establishments.length === 1 ? establishments[0].id : "");
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
    if (!establishmentId || !name) return;
    const result = await createPaddockAction({ establishmentId, name });
    if (!result.ok) {
      setCreateError(result.error);
      return;
    }
    setPaddocks((prev) => [...prev, result.entry]);
    setName("");
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
              <DialogTitle>Nuevo potrero</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="paddock-establishment">Campo</Label>
              <select
                id="paddock-establishment"
                value={establishmentId}
                onChange={(e) => setEstablishmentId(e.target.value)}
                className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
              >
                <option value="">Elegir...</option>
                {establishments.map((establishment) => (
                  <option key={establishment.id} value={establishment.id}>
                    {establishment.name}
                  </option>
                ))}
              </select>

              <Label htmlFor="paddock-name">Nombre</Label>
              <Input id="paddock-name" value={name} onChange={(e) => setName(e.target.value)} />

              {establishments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tenés campos asociados</p>
              ) : null}
              {createError ? <p className="text-sm text-destructive">{createError}</p> : null}

              <Button type="button" disabled={!establishmentId || !name} onClick={handleCreate}>
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
                <td className="py-1 pr-2">{establishmentNameById.get(entry.establishmentId) ?? ""}</td>
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
                <td className="py-1 pr-2">{establishmentNameById.get(entry.establishmentId) ?? ""}</td>
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
