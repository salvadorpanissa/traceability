"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OwnerCatalogEntry } from "@/lib/dal/owner-catalog";

export function PendingOwnerEditor({
  pendingNames,
  onCreateOwner,
  onResolved,
}: {
  pendingNames: string[];
  onCreateOwner: (name: string) => Promise<OwnerCatalogEntry>;
  onResolved: (rawName: string, ownerId: string) => void;
}) {
  const [nameByPending, setNameByPending] = useState<Record<string, string>>({});
  const [errorByPending, setErrorByPending] = useState<Record<string, string>>({});
  const [resolvedNames, setResolvedNames] = useState<string[]>([]);

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
      <p className="text-sm font-medium">Propietarios pendientes de crear</p>
      {remaining.map((rawName) => (
        <div key={rawName} className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <p className="text-sm text-muted-foreground">{rawName}</p>
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
