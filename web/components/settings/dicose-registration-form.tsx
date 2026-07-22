"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDicoseRegistrationAction } from "@/app/(protected)/settings/dicose/actions";
import type { DicoseRegistrationEntry } from "@/lib/dal/dicose-registration";
import type { OwnerCatalogEntry } from "@/lib/dal/owner-catalog";

export function DicoseRegistrationForm({
  registrations: initialRegistrations,
  owners,
  farms,
}: {
  registrations: DicoseRegistrationEntry[];
  owners: OwnerCatalogEntry[];
  farms: { id: string; name: string }[];
}) {
  const [registrations, setRegistrations] = useState(initialRegistrations);
  const [ownerId, setOwnerId] = useState("");
  const [farmId, setFarmId] = useState("");
  const [dicoseCode, setDicoseCode] = useState("");

  async function handleSubmit() {
    if (!ownerId || !farmId || !dicoseCode) return;
    const created = await createDicoseRegistrationAction({ ownerId, farmId, dicoseCode });
    setRegistrations((prev) => [...prev, created]);
    setDicoseCode("");
  }

  return (
    <div className="flex flex-col gap-4">
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
              <td className="py-1 pr-2">{registration.farmName}</td>
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
          className="h-8 rounded border px-2 text-sm"
        >
          <option value="">Elegir...</option>
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.name}
            </option>
          ))}
        </select>

        <Label htmlFor="dicose-farm">Campo</Label>
        <select
          id="dicose-farm"
          value={farmId}
          onChange={(e) => setFarmId(e.target.value)}
          className="h-8 rounded border px-2 text-sm"
        >
          <option value="">Elegir...</option>
          {farms.map((farm) => (
            <option key={farm.id} value={farm.id}>
              {farm.name}
            </option>
          ))}
        </select>

        <Label htmlFor="dicose-code">Código DICOSE</Label>
        <Input id="dicose-code" value={dicoseCode} onChange={(e) => setDicoseCode(e.target.value)} />

        <Button type="button" disabled={!ownerId || !farmId || !dicoseCode} onClick={handleSubmit}>
          Agregar
        </Button>
      </div>
    </div>
  );
}
