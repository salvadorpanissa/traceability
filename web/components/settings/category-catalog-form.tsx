"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createCategoryAction,
  updateCategoryAction,
  archiveCategoryAction,
} from "@/app/(protected)/settings/categories/actions";
import type { CategoryCatalogEntry } from "@/lib/dal/category-catalog";

type Farm = { id: string; name: string };

export function CategoryCatalogForm({
  categories: initialCategories,
  animalCounts: initialAnimalCounts = {},
  farms,
}: {
  categories: CategoryCatalogEntry[];
  animalCounts?: Record<string, number>;
  farms: Farm[];
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [animalCounts, setAnimalCounts] = useState(initialAnimalCounts);
  const farmLabels = new Map(farms.map((f) => [f.id, f.name]));
  const showFarmColumn = farms.length > 1;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSex, setEditSex] = useState("");
  const [editMinAgeMonths, setEditMinAgeMonths] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [farmId, setFarmId] = useState(farms.length === 1 ? farms[0].id : "");
  const [name, setName] = useState("");
  const [sex, setSex] = useState("");
  const [minAgeMonths, setMinAgeMonths] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [archiveTargetId, setArchiveTargetId] = useState("");
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  const activeCategories = categories.filter((c) => c.active);
  const archivedCategories = categories.filter((c) => !c.active);

  function startEdit(entry: CategoryCatalogEntry) {
    setEditingId(entry.id);
    setEditName(entry.name);
    setEditSex(entry.sex ?? "");
    setEditMinAgeMonths(entry.minAgeMonths === null ? "" : String(entry.minAgeMonths));
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(id: string) {
    if (!editName) return;
    const result = await updateCategoryAction({
      id,
      name: editName,
      sex: editSex === "" ? null : (editSex as "male" | "female"),
      minAgeMonths: editMinAgeMonths === "" ? null : Number(editMinAgeMonths),
    });
    if (!result.ok) {
      setEditError(result.error);
      return;
    }
    setCategories((prev) => prev.map((c) => (c.id === id ? result.entry : c)));
    setEditingId(null);
  }

  async function handleCreate() {
    if (!farmId || !name) return;
    const result = await createCategoryAction({
      farmId,
      name,
      sex: sex === "" ? null : (sex as "male" | "female"),
      minAgeMonths: minAgeMonths === "" ? null : Number(minAgeMonths),
    });
    if (!result.ok) {
      setCreateError(result.error);
      return;
    }
    setCategories((prev) => [...prev, result.entry]);
    setName("");
    setSex("");
    setMinAgeMonths("");
    setCreateError(null);
    setCreateOpen(false);
  }

  function startArchive(id: string) {
    setArchivingId(id);
    setArchiveTargetId("");
    setArchiveError(null);
  }

  function cancelArchive() {
    setArchivingId(null);
    setArchiveError(null);
  }

  async function confirmArchive(id: string) {
    const count = animalCounts[id] ?? 0;
    if (count > 0 && !archiveTargetId) return;

    setArchiving(true);
    const result = await archiveCategoryAction({
      categoryId: id,
      targetCategoryId: count > 0 ? archiveTargetId : null,
    });
    setArchiving(false);

    if (!result.ok) {
      setArchiveError(result.error);
      return;
    }

    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, active: false } : c)));
    setAnimalCounts((prev) => {
      const next = { ...prev, [id]: 0 };
      if (archiveTargetId) next[archiveTargetId] = (next[archiveTargetId] ?? 0) + result.reassigned;
      return next;
    });
    setArchivingId(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button type="button" />}>+ Agregar</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nueva categoría</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              {farms.length > 1 ? (
                <>
                  <Label htmlFor="category-farm">Campo</Label>
                  <select
                    id="category-farm"
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

              <Label htmlFor="category-name">Nombre</Label>
              <Input id="category-name" value={name} onChange={(e) => setName(e.target.value)} />

              <Label htmlFor="category-sex">Sexo</Label>
              <select
                id="category-sex"
                value={sex}
                onChange={(e) => setSex(e.target.value)}
                className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
              >
                <option value="">Ambos / no aplica</option>
                <option value="male">Macho</option>
                <option value="female">Hembra</option>
              </select>

              <Label htmlFor="category-min-age-months">Edad mínima (meses)</Label>
              <Input
                id="category-min-age-months"
                type="number"
                value={minAgeMonths}
                onChange={(e) => setMinAgeMonths(e.target.value)}
              />

              {createError ? <p className="text-sm text-destructive">{createError}</p> : null}

              <Button type="button" disabled={!farmId || !name} onClick={handleCreate}>
                Agregar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1 pr-2">Nombre</th>
              <th className="py-1 pr-2">Sexo</th>
              <th className="py-1 pr-2">Edad mín. (meses)</th>
              {showFarmColumn ? <th className="py-1 pr-2">Campo</th> : null}
              <th className="py-1 pr-2" />
            </tr>
          </thead>
          <tbody>
            {activeCategories.map((entry) =>
              editingId === entry.id ? (
                <tr key={entry.id} className="border-b last:border-0">
                  <td className="py-1 pr-2">
                    <Input aria-label="Editar nombre" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </td>
                  <td className="py-1 pr-2">
                    <select
                      aria-label="Editar sexo"
                      value={editSex}
                      onChange={(e) => setEditSex(e.target.value)}
                      className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
                    >
                      <option value="">Ambos / no aplica</option>
                      <option value="male">Macho</option>
                      <option value="female">Hembra</option>
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <Input
                      aria-label="Editar edad mínima"
                      type="number"
                      value={editMinAgeMonths}
                      onChange={(e) => setEditMinAgeMonths(e.target.value)}
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
                  <td className="py-1 pr-2">
                    {entry.sex === "male" ? "Macho" : entry.sex === "female" ? "Hembra" : "—"}
                  </td>
                  <td className="py-1 pr-2">{entry.minAgeMonths ?? "—"}</td>
                  {showFarmColumn ? <td className="py-1 pr-2">{farmLabels.get(entry.farmId) ?? ""}</td> : null}
                  <td className="flex gap-1 py-1 pr-2">
                    <Button type="button" size="sm" variant="ghost" onClick={() => startEdit(entry)}>
                      Editar
                    </Button>
                    <Button type="button" size="sm" variant="destructive" onClick={() => startArchive(entry.id)}>
                      Eliminar
                    </Button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
      {editError ? <p className="text-sm text-destructive">{editError}</p> : null}

      {archivingId
        ? (() => {
            const entry = categories.find((c) => c.id === archivingId)!;
            const count = animalCounts[archivingId] ?? 0;
            const targetOptions = activeCategories.filter(
              (c) => c.id !== archivingId && c.farmId === entry.farmId
            );
            return (
              <div className="flex flex-col gap-2 rounded-lg border border-amber-500 bg-amber-50 p-3 text-sm dark:bg-amber-950">
                {count > 0 ? (
                  <>
                    <p>
                      Hay {count} {count === 1 ? "animal" : "animales"} en “{entry.name}”. Elegí a qué categoría
                      pasarlos:
                    </p>
                    <select
                      aria-label="Pasar animales a"
                      value={archiveTargetId}
                      onChange={(e) => setArchiveTargetId(e.target.value)}
                      className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
                    >
                      <option value="">Elegir categoría</option>
                      {targetOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <p>¿Archivar “{entry.name}”? No tiene animales activos.</p>
                )}
                {archiveError ? <p className="text-destructive">{archiveError}</p> : null}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={archiving || (count > 0 && !archiveTargetId)}
                    onClick={() => confirmArchive(archivingId)}
                  >
                    Confirmar
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={cancelArchive}>
                    Cancelar
                  </Button>
                </div>
              </div>
            );
          })()
        : null}

      {archivedCategories.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground">Categorías archivadas</p>
          <table className="w-full text-sm text-muted-foreground">
            <tbody>
              {archivedCategories.map((entry) => (
                <tr key={entry.id} className="border-b last:border-0">
                  <td className="py-1 pr-2">{entry.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
