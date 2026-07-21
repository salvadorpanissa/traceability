"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PaddockCatalogEntry } from "@/lib/dal/paddock-catalog";

const CREATE_NEW_VALUE = "__create_new__";
const NONE_VALUE = "";

export function PaddockSelector({
  paddocks,
  paddockId,
  onChange,
  onCreatePaddock,
}: {
  paddocks: PaddockCatalogEntry[];
  paddockId: string | null;
  onChange: (paddockId: string | null) => void;
  onCreatePaddock: (name: string) => Promise<PaddockCatalogEntry>;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");

  function handleSelect(value: string) {
    if (value === CREATE_NEW_VALUE) {
      setCreating(true);
      return;
    }
    setCreating(false);
    onChange(value === NONE_VALUE ? null : value);
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setError("");
    try {
      const created = await onCreatePaddock(name);
      setCreating(false);
      setNewName("");
      onChange(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el potrero");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="destinationPaddock">Potrero destino</Label>
      <select
        id="destinationPaddock"
        aria-label="Potrero destino"
        value={paddockId ?? NONE_VALUE}
        onChange={(e) => handleSelect(e.target.value)}
        className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
      >
        <option value={NONE_VALUE}>Sin potrero</option>
        {paddocks.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
        <option value={CREATE_NEW_VALUE}>+ Crear potrero nuevo</option>
      </select>
      {creating ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-paddock-name">Nombre del potrero nuevo</Label>
          <Input
            id="new-paddock-name"
            aria-label="Nombre del potrero nuevo"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button type="button" size="sm" onClick={handleCreate}>
            Crear
          </Button>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
