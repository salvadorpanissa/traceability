"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OwnerCatalogEntry } from "@/lib/dal/owner-catalog";

export function PendingOwnerEditor({
  pendingNames,
  ownerCatalog = [],
  onCreateOwner,
  onResolved,
}: {
  pendingNames: string[];
  ownerCatalog?: OwnerCatalogEntry[];
  onCreateOwner: (name: string) => Promise<OwnerCatalogEntry>;
  onResolved: (rawName: string, ownerId: string) => void;
}) {
  const [nameByPending, setNameByPending] = useState<Record<string, string>>({});
  const [errorByPending, setErrorByPending] = useState<Record<string, string>>({});
  const [resolvedNames, setResolvedNames] = useState<string[]>([]);
  const sortedCatalog = [...ownerCatalog].sort((a, b) => a.name.localeCompare(b.name));

  function handleSelectExisting(rawName: string, ownerId: string) {
    if (!ownerId) return;
    setResolvedNames((prev) => [...prev, rawName]);
    onResolved(rawName, ownerId);
  }

  async function handleCreate(rawName: string) {
    const name = (nameByPending[rawName] ?? rawName).trim();
    if (!name) return;
    setErrorByPending((prev) => ({ ...prev, [rawName]: "" }));
    try {
      const created = await onCreateOwner(name);
      setResolvedNames((prev) => [...prev, rawName]);
      onResolved(rawName, created.id);
    } catch (error) {
      setErrorByPending((prev) => ({
        ...prev,
        [rawName]: error instanceof Error ? error.message : "No se pudo crear el propietario",
      }));
    }
  }

  const remaining = pendingNames.filter((name) => !resolvedNames.includes(name));
  if (remaining.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-medium">Propietarios pendientes de resolver</p>
      {remaining.map((rawName) => (
        <div key={rawName} className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <p className="text-sm text-muted-foreground">{rawName}</p>

          {sortedCatalog.length > 0 ? (
            <>
              <Label htmlFor={`existing-owner-${rawName}`}>Usar un propietario existente</Label>
              <select
                id={`existing-owner-${rawName}`}
                aria-label="Usar un propietario existente"
                value=""
                onChange={(e) => handleSelectExisting(rawName, e.target.value)}
                className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
              >
                <option value="">Elegir propietario</option>
                {sortedCatalog.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </>
          ) : null}

          <Label htmlFor={`owner-${rawName}`}>Nombre del propietario</Label>
          <Input
            id={`owner-${rawName}`}
            value={nameByPending[rawName] ?? rawName}
            onChange={(e) => setNameByPending((prev) => ({ ...prev, [rawName]: e.target.value }))}
          />
          <Button type="button" size="sm" onClick={() => handleCreate(rawName)}>
            Crear
          </Button>
          {errorByPending[rawName] ? <p className="text-sm text-red-600">{errorByPending[rawName]}</p> : null}
        </div>
      ))}
    </div>
  );
}
