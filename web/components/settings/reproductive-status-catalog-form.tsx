"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createReproductiveStatusAction,
  updateReproductiveStatusAction,
  archiveReproductiveStatusAction,
} from "@/app/(protected)/settings/reproductive-status/actions";
import type { ReproductiveStatusCatalogEntry } from "@/lib/dal/reproductive-status-catalog";

type Farm = { id: string; name: string };

export function ReproductiveStatusCatalogForm({
  statuses: initialStatuses,
  farms,
}: {
  statuses: ReproductiveStatusCatalogEntry[];
  farms: Farm[];
}) {
  const [statuses, setStatuses] = useState(initialStatuses);
  const farmLabels = new Map(farms.map((f) => [f.id, f.name]));
  const showFarmColumn = farms.length > 1;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [farmId, setFarmId] = useState(farms.length === 1 ? farms[0].id : "");
  const [name, setName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const activeStatuses = statuses.filter((s) => s.active);
  const archivedStatuses = statuses.filter((s) => !s.active);

  function startEdit(entry: ReproductiveStatusCatalogEntry) {
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
    const result = await updateReproductiveStatusAction({ id, name: editName });
    if (!result.ok) {
      setEditError(result.error);
      return;
    }
    setStatuses((prev) => prev.map((s) => (s.id === id ? result.entry : s)));
    setEditingId(null);
  }

  async function handleCreate() {
    if (!farmId || !name) return;
    const result = await createReproductiveStatusAction({ farmId, name });
    if (!result.ok) {
      setCreateError(result.error);
      return;
    }
    setStatuses((prev) => [...prev, result.entry]);
    setName("");
    setCreateError(null);
    setCreateOpen(false);
  }

  async function handleArchive(id: string) {
    const result = await archiveReproductiveStatusAction(id);
    if (!result.ok) return;
    setStatuses((prev) => prev.map((s) => (s.id === id ? result.entry : s)));
  }

  return (
    <>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Estados reproductivos</CardTitle>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button type="button" />}>
            + Agregar
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo estado reproductivo</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              {farms.length > 1 ? (
                <>
                  <Label htmlFor="reproductive-status-farm">Campo</Label>
                  <select
                    id="reproductive-status-farm"
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

              <Label htmlFor="reproductive-status-name">Nombre</Label>
              <Input
                id="reproductive-status-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              {createError ? (
                <p className="text-sm text-destructive">{createError}</p>
              ) : null}

              <Button
                type="button"
                disabled={!farmId || !name}
                onClick={handleCreate}
              >
                Agregar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-1 pr-2">Nombre</th>
                {showFarmColumn ? <th className="py-1 pr-2">Campo</th> : null}
                <th className="w-px whitespace-nowrap py-1 pr-2" />
              </tr>
            </thead>
            <tbody>
              {activeStatuses.map((entry) =>
                editingId === entry.id ? (
                  <tr key={entry.id} className="border-b last:border-0">
                    <td className="py-1 pr-2">
                      <Input
                        aria-label="Editar nombre"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </td>
                    {showFarmColumn ? (
                      <td className="py-1 pr-2">
                        {farmLabels.get(entry.farmId) ?? ""}
                      </td>
                    ) : null}
                    <td className="whitespace-nowrap py-1 pr-2">
                      <div className="flex gap-1 whitespace-nowrap">
                        <Button
                          type="button"
                          size="sm"
                          disabled={!editName}
                          onClick={() => saveEdit(entry.id)}
                        >
                          Guardar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={cancelEdit}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={entry.id} className="border-b last:border-0">
                    <td className="py-1 pr-2">{entry.name}</td>
                    {showFarmColumn ? (
                      <td className="py-1 pr-2">
                        {farmLabels.get(entry.farmId) ?? ""}
                      </td>
                    ) : null}
                    <td className="whitespace-nowrap py-1 pr-2">
                      <div className="flex gap-1 whitespace-nowrap">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => startEdit(entry)}
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => handleArchive(entry.id)}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        {editError ? (
          <p className="text-sm text-destructive">{editError}</p>
        ) : null}

        {archivedStatuses.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              Estados archivados
            </p>
            <table className="w-full text-sm text-muted-foreground">
              <tbody>
                {archivedStatuses.map((entry) => (
                  <tr key={entry.id} className="border-b last:border-0">
                    <td className="py-1 pr-2">{entry.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </>
  );
}
