"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadOwnTags } from "@/app/(protected)/settings/own-tags/actions";
import type { DicoseRegistrationEntry } from "@/lib/dal/dicose-registration";
import type { OwnTagImportResult } from "@/lib/dal/own-tag";

type CountRow = { registration: DicoseRegistrationEntry; count: number; lastUploadedAt: string | null };

export function OwnTagUploadForm({
  registrations,
  counts: initialCounts,
}: {
  registrations: DicoseRegistrationEntry[];
  counts: CountRow[];
}) {
  const [counts, setCounts] = useState(initialCounts);
  const [dicoseRegistrationId, setDicoseRegistrationId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<OwnTagImportResult | null>(null);

  async function handleUpload() {
    if (!dicoseRegistrationId || !file) return;
    const formData = new FormData();
    formData.set("file", file);
    const importResult = await uploadOwnTags(dicoseRegistrationId, formData);
    setResult(importResult);
    setCounts((prev) =>
      prev.map((row) =>
        row.registration.id === dicoseRegistrationId
          ? { ...row, count: row.count + importResult.inserted, lastUploadedAt: new Date().toISOString() }
          : row
      )
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1 pr-2">Dueño</th>
            <th className="py-1 pr-2">Campo</th>
            <th className="py-1 pr-2">DICOSE</th>
            <th className="py-1 pr-2">Caravanas cargadas</th>
            <th className="py-1 pr-2">Última carga</th>
          </tr>
        </thead>
        <tbody>
          {counts.map((row) => (
            <tr key={row.registration.id} className="border-b last:border-0">
              <td className="py-1 pr-2">{row.registration.ownerName}</td>
              <td className="py-1 pr-2">{row.registration.farmName}</td>
              <td className="py-1 pr-2">{row.registration.dicoseCode}</td>
              <td className="py-1 pr-2">{row.count}</td>
              <td className="py-1 pr-2">{row.lastUploadedAt ? new Date(row.lastUploadedAt).toLocaleDateString() : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-col gap-2">
        <Label htmlFor="own-tag-dicose">Registro DICOSE</Label>
        <select
          id="own-tag-dicose"
          value={dicoseRegistrationId}
          onChange={(e) => setDicoseRegistrationId(e.target.value)}
          className="h-8 rounded border px-2 text-sm"
        >
          <option value="">Elegir...</option>
          {registrations.map((registration) => (
            <option key={registration.id} value={registration.id}>
              {registration.ownerName} — {registration.farmName} ({registration.dicoseCode})
            </option>
          ))}
        </select>

        <Label htmlFor="own-tag-file">Archivo</Label>
        <Input id="own-tag-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />

        <Button type="button" disabled={!dicoseRegistrationId || !file} onClick={handleUpload}>
          Subir
        </Button>

        {result ? (
          <p className="text-sm text-muted-foreground">
            {result.inserted} caravanas nuevas cargadas, {result.skipped} ya existían, {result.invalid} filas
            inválidas ignoradas.
          </p>
        ) : null}
      </div>
    </div>
  );
}
