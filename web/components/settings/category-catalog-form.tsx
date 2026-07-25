"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCategoryAction, updateCategoryAction } from "@/app/(protected)/settings/categories/actions";
import type { CategoryCatalogEntry } from "@/lib/dal/category-catalog";

export function CategoryCatalogForm({ categories: initialCategories }: { categories: CategoryCatalogEntry[] }) {
  const [categories, setCategories] = useState(initialCategories);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSex, setEditSex] = useState("");
  const [editMinAgeMonths, setEditMinAgeMonths] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [sex, setSex] = useState("");
  const [minAgeMonths, setMinAgeMonths] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

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
    if (!name) return;
    const result = await createCategoryAction({
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
  }

  return (
    <div className="flex flex-col gap-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1 pr-2">Nombre</th>
            <th className="py-1 pr-2">Sexo</th>
            <th className="py-1 pr-2">Edad mín. (meses)</th>
            <th className="py-1 pr-2" />
          </tr>
        </thead>
        <tbody>
          {categories.map((entry) =>
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

        <Button type="button" disabled={!name} onClick={handleCreate}>
          Agregar
        </Button>
      </div>
    </div>
  );
}
