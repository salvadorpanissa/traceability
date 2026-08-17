"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createFarmAction } from "@/app/(protected)/dashboard/actions";
import type { FarmOverviewEntry, ManagerCandidate } from "@/lib/dal/admin-overview";

export function AdminFarmsOverview({
  farms: initialFarms,
  managerCandidates,
}: {
  farms: FarmOverviewEntry[];
  managerCandidates: ManagerCandidate[];
}) {
  const [farms, setFarms] = useState(initialFarms);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [managerId, setManagerId] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name) return;
    const result = await createFarmAction({ name, managerId: managerId || null });
    if (!result.ok) {
      setCreateError(result.error);
      return;
    }
    setFarms((prev) => [...prev, result.entry]);
    setName("");
    setManagerId("");
    setCreateError(null);
    setCreateOpen(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Campos</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button type="button" />}>+ Nuevo campo</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo campo</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="farm-name">Nombre</Label>
              <Input id="farm-name" value={name} onChange={(e) => setName(e.target.value)} />

              <Label htmlFor="farm-manager">Manager (opcional)</Label>
              <select
                id="farm-manager"
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
                className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
              >
                <option value="">Sin asignar</option>
                {managerCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} ({candidate.email})
                  </option>
                ))}
              </select>

              {createError ? <p className="text-sm text-destructive">{createError}</p> : null}

              <Button type="button" disabled={!name} onClick={handleCreate}>
                Crear
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1 pr-2">Campo</th>
            <th className="py-1 pr-2">Establecimientos</th>
            <th className="py-1 pr-2">Managers</th>
          </tr>
        </thead>
        <tbody>
          {farms.map((farmEntry) => (
            <tr key={farmEntry.id} className="border-b last:border-0">
              <td className="py-1 pr-2">{farmEntry.name}</td>
              <td className="py-1 pr-2">{farmEntry.establishmentCount}</td>
              <td className="py-1 pr-2">{farmEntry.managerCount}</td>
            </tr>
          ))}
          {farms.length === 0 ? (
            <tr>
              <td colSpan={3} className="py-2 text-muted-foreground">
                Todavía no hay campos creados
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
