"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createDicoseRegistrationAction,
  createOwnerAction,
} from "@/app/(protected)/settings/dicose/actions";
import type { DicoseEntry } from "@/lib/dal/dicose";
import type { OwnerCatalogEntry } from "@/lib/dal/owner-catalog";

export function DicoseRegistrationForm({
  registrations: initialRegistrations,
  owners: initialOwners,
  establishments,
  farms,
}: {
  registrations: DicoseEntry[];
  owners: OwnerCatalogEntry[];
  establishments: { id: string; name: string; farmId: string }[];
  farms: { id: string; name: string }[];
}) {
  const [registrations, setRegistrations] = useState(initialRegistrations);
  const [owners, setOwners] = useState(initialOwners);
  const [ownerId, setOwnerId] = useState("");
  const [establishmentId, setEstablishmentId] = useState("");
  const [dicoseCode, setDicoseCode] = useState("");

  const [isNewOwnerOpen, setIsNewOwnerOpen] = useState(false);
  const [newOwnerFarmId, setNewOwnerFarmId] = useState(
    farms.length === 1 ? farms[0].id : "",
  );
  const [newOwnerName, setNewOwnerName] = useState("");
  const [newOwnerError, setNewOwnerError] = useState("");

  const selectedEstablishmentFarmId = establishments.find(
    (e) => e.id === establishmentId,
  )?.farmId;
  const visibleOwners = selectedEstablishmentFarmId
    ? owners.filter((o) => o.farmId === selectedEstablishmentFarmId)
    : owners;

  async function handleSubmit() {
    if (!ownerId || !establishmentId || !dicoseCode) return;
    const created = await createDicoseRegistrationAction({
      ownerId,
      establishmentId,
      dicoseCode,
    });
    setRegistrations((prev) => [...prev, created]);
    setDicoseCode("");
  }

  async function handleCreateOwner() {
    if (!newOwnerFarmId || !newOwnerName) return;
    setNewOwnerError("");
    try {
      const created = await createOwnerAction(newOwnerFarmId, newOwnerName);
      setOwners((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setOwnerId(created.id);
      setNewOwnerName("");
      setIsNewOwnerOpen(false);
    } catch (err) {
      setNewOwnerError(
        err instanceof Error ? err.message : "No se pudo crear el dueño",
      );
    }
  }

  return (
    <>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Registrar dueño</CardTitle>
        <Dialog open={isNewOwnerOpen} onOpenChange={setIsNewOwnerOpen}>
          <DialogTrigger render={<Button type="button" />}>
            + Agregar
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo dueño</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              {farms.length > 1 ? (
                <>
                  <Label htmlFor="new-owner-farm">Grupo de campos</Label>
                  <select
                    id="new-owner-farm"
                    value={newOwnerFarmId}
                    onChange={(e) => setNewOwnerFarmId(e.target.value)}
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

              <Label htmlFor="new-owner-name">Nombre</Label>
              <Input
                id="new-owner-name"
                value={newOwnerName}
                onChange={(e) => setNewOwnerName(e.target.value)}
              />

              {farms.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No tenés grupos de campos asociados
                </p>
              ) : null}
              {newOwnerError ? (
                <p className="text-sm text-destructive">{newOwnerError}</p>
              ) : null}

              <Button
                type="button"
                disabled={!newOwnerFarmId || !newOwnerName}
                onClick={handleCreateOwner}
              >
                Agregar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1 pr-2">Dueño</th>
              <th className="py-1 pr-2">Campo</th>
              <th className="py-1 pr-2">DICOSE</th>
            </tr>
          </thead>
          <tbody>
            {registrations.map((registration) => (
              <tr key={registration.id} className="border-b last:border-0">
                <td className="py-1 pr-2">{registration.ownerName}</td>
                <td className="py-1 pr-2">{registration.establishmentName}</td>
                <td className="py-1 pr-2">{registration.dicoseCode}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex flex-col gap-2">
          <Label htmlFor="dicose-owner">Dueño</Label>
          <select
            id="dicose-owner"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
          >
            <option value="">Elegir...</option>
            {visibleOwners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
          </select>

          <Label htmlFor="dicose-establishment">Campo</Label>
          <select
            id="dicose-establishment"
            value={establishmentId}
            onChange={(e) => {
              const nextEstablishmentId = e.target.value;
              setEstablishmentId(nextEstablishmentId);
              const nextFarmId = establishments.find(
                (est) => est.id === nextEstablishmentId,
              )?.farmId;
              const selectedOwner = owners.find((o) => o.id === ownerId);
              if (
                nextFarmId &&
                selectedOwner &&
                selectedOwner.farmId !== nextFarmId
              ) {
                setOwnerId("");
              }
            }}
            className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
          >
            <option value="">Elegir...</option>
            {establishments.map((establishment) => (
              <option key={establishment.id} value={establishment.id}>
                {establishment.name}
              </option>
            ))}
          </select>

          <Label htmlFor="dicose-code">DICOSE</Label>
          <Input
            id="dicose-code"
            value={dicoseCode}
            onChange={(e) => setDicoseCode(e.target.value)}
          />

          <Button
            type="button"
            disabled={!ownerId || !establishmentId || !dicoseCode}
            onClick={handleSubmit}
          >
            Agregar
          </Button>
        </div>
      </CardContent>
    </>
  );
}
