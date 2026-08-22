"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ReproductiveStatusCatalogEntry } from "@/lib/dal/reproductive-status-catalog";

export function ReproductiveStatusLegend({
  distinctValues,
  catalog: initialCatalog,
  initialValueMap,
  onCreateStatus,
  onChange,
}: {
  distinctValues: string[];
  catalog: ReproductiveStatusCatalogEntry[];
  initialValueMap?: Record<string, string>;
  onCreateStatus: (name: string) => Promise<ReproductiveStatusCatalogEntry>;
  onChange: (valueMap: Record<string, string>) => void;
}) {
  const [catalog, setCatalog] = useState(initialCatalog);
  const [valueMap, setValueMap] = useState<Record<string, string>>(initialValueMap ?? {});
  const [newStatusName, setNewStatusName] = useState("");
  const [createError, setCreateError] = useState("");

  function handleAssign(rawValue: string, statusId: string) {
    const next = { ...valueMap, [rawValue]: statusId };
    setValueMap(next);
    onChange(next);
  }

  async function handleCreateStatus() {
    const name = newStatusName.trim();
    if (!name) return;
    setCreateError("");
    try {
      const created = await onCreateStatus(name);
      setCatalog((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewStatusName("");
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "No se pudo crear el estado");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <p className="text-sm font-medium">A qué estado corresponde cada valor de la columna</p>

        {distinctValues.map((rawValue) => (
          <div key={rawValue} className="flex items-center justify-center gap-2">
            <span className="truncate text-sm">{rawValue}</span>
            <span aria-hidden="true" className="text-muted-foreground">
              →
            </span>
            <select
              aria-label={`Valor: ${rawValue}`}
              value={valueMap[rawValue] ?? ""}
              onChange={(e) => handleAssign(rawValue, e.target.value)}
              className="h-8 w-40 shrink-0 rounded-lg border border-border bg-background px-2 text-sm"
            >
              <option value="">Sin dato</option>
              {catalog.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <Label htmlFor="new-reproductive-status-name">Nombre del estado nuevo</Label>
        <Input
          id="new-reproductive-status-name"
          value={newStatusName}
          onChange={(e) => setNewStatusName(e.target.value)}
        />
        <Button type="button" size="sm" onClick={handleCreateStatus}>
          Crear estado
        </Button>
        {createError ? <p className="text-sm text-destructive">{createError}</p> : null}
      </div>
    </div>
  );
}
