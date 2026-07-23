"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PaddockCatalogEntry } from "@/lib/dal/paddock-catalog";

const CREATE_NEW_VALUE = "__create_new__";

// Picks a potrero out of every campo the user can access — the campo itself
// is derived from whichever potrero gets picked, instead of being asked for
// as a separate step, since the potrero already implies it.
export function FarmPaddockPicker({
  farms,
  paddocks,
  paddockId,
  onSelect,
  onCreatePaddock,
}: {
  farms: { id: string; name: string }[];
  paddocks: PaddockCatalogEntry[];
  paddockId: string | null;
  onSelect: (paddockId: string, farmId: string) => void;
  onCreatePaddock: (farmId: string, name: string) => Promise<PaddockCatalogEntry>;
}) {
  const [creating, setCreating] = useState(false);
  const [newFarmId, setNewFarmId] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");

  function farmName(farmId: string): string {
    return farms.find((f) => f.id === farmId)?.name ?? "";
  }

  function handleSelect(value: string) {
    if (value === CREATE_NEW_VALUE) {
      setCreating(true);
      return;
    }
    setCreating(false);
    const selected = paddocks.find((p) => p.id === value);
    if (selected) onSelect(selected.id, selected.farmId);
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!newFarmId || !name) return;
    setError("");
    try {
      const created = await onCreatePaddock(newFarmId, name);
      setCreating(false);
      setNewName("");
      onSelect(created.id, created.farmId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el potrero");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="paddock">Potrero</Label>
      <select
        id="paddock"
        aria-label="Potrero"
        value={paddockId ?? ""}
        onChange={(e) => handleSelect(e.target.value)}
        className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
      >
        <option value="">Elegir potrero</option>
        {paddocks.map((p) => (
          <option key={p.id} value={p.id}>
            {farmName(p.farmId)} — {p.name}
          </option>
        ))}
        <option value={CREATE_NEW_VALUE}>+ Crear potrero nuevo</option>
      </select>
      {creating ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-paddock-farm">Campo del potrero nuevo</Label>
          <select
            id="new-paddock-farm"
            aria-label="Campo del potrero nuevo"
            value={newFarmId}
            onChange={(e) => setNewFarmId(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
          >
            <option value="">Elegir campo</option>
            {farms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <Label htmlFor="new-paddock-name">Nombre del potrero nuevo</Label>
          <Input
            id="new-paddock-name"
            aria-label="Nombre del potrero nuevo"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button type="button" size="sm" disabled={!newFarmId || !newName.trim()} onClick={handleCreate}>
            Crear
          </Button>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
