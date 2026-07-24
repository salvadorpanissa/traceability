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
  const [editSortOrder, setEditSortOrder] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState(String(initialCategories.length));
  const [createError, setCreateError] = useState<string | null>(null);

  function startEdit(entry: CategoryCatalogEntry) {
    setEditingId(entry.id);
    setEditName(entry.name);
    setEditSortOrder(String(entry.sortOrder));
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(id: string) {
    if (!editName || editSortOrder === "") return;
    const result = await updateCategoryAction({ id, name: editName, sortOrder: Number(editSortOrder) });
    if (!result.ok) {
      setEditError(result.error);
      return;
    }
    setCategories((prev) => prev.map((c) => (c.id === id ? result.entry : c)));
    setEditingId(null);
  }

  async function handleCreate() {
    if (!name || sortOrder === "") return;
    const result = await createCategoryAction({ name, sortOrder: Number(sortOrder) });
    if (!result.ok) {
      setCreateError(result.error);
      return;
    }
    setCategories((prev) => [...prev, result.entry]);
    setName("");
    setSortOrder(String(categories.length + 1));
    setCreateError(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1 pr-2">Nombre</th>
            <th className="py-1 pr-2">Orden</th>
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
                  <Input
                    aria-label="Editar orden"
                    type="number"
                    value={editSortOrder}
                    onChange={(e) => setEditSortOrder(e.target.value)}
                  />
                </td>
                <td className="flex gap-1 py-1 pr-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!editName || editSortOrder === ""}
                    onClick={() => saveEdit(entry.id)}
                  >
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
                <td className="py-1 pr-2">{entry.sortOrder}</td>
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

        <Label htmlFor="category-sort-order">Orden</Label>
        <Input
          id="category-sort-order"
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />

        {createError ? <p className="text-sm text-destructive">{createError}</p> : null}

        <Button type="button" disabled={!name || sortOrder === ""} onClick={handleCreate}>
          Agregar
        </Button>
      </div>
    </div>
  );
}
