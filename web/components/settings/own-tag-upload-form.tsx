"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColumnMapper } from "@/components/activities/column-mapper";
import { PendingItemEditor } from "@/components/activities/pending-item-editor";
import {
  previewOwnTagUpload,
  confirmOwnTagUpload,
  createOwnTagPaddockAction,
  createOwnTagCategoryAction,
  type OwnTagPreviewResult,
} from "@/app/(protected)/settings/own-tags/actions";
import { ownTagMappingHasPaddock, type ColumnMapping } from "@/lib/activities/column-mapping";
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
  const [preview, setPreview] = useState<OwnTagPreviewResult | null>(null);
  const [resolvedPaddockNames, setResolvedPaddockNames] = useState<string[]>([]);
  const [resolvedCategoryNames, setResolvedCategoryNames] = useState<string[]>([]);
  const [result, setResult] = useState<OwnTagImportResult | null>(null);

  function handleFileChange(selected: File | null) {
    setFile(selected);
    setPreview(null);
    setResolvedPaddockNames([]);
    setResolvedCategoryNames([]);
    setResult(null);
  }

  async function runPreview(mapping?: ColumnMapping[]) {
    if (!file || !dicoseRegistrationId) return;
    const formData = new FormData();
    formData.set("file", file);
    if (mapping) formData.set("mapping", JSON.stringify(mapping));
    setResolvedPaddockNames([]);
    setResolvedCategoryNames([]);
    setPreview(await previewOwnTagUpload(dicoseRegistrationId, formData));
  }

  async function handleCreatePaddock(name: string) {
    const farmId = registrations.find((r) => r.id === dicoseRegistrationId)?.farmId;
    if (!farmId) throw new Error("Elegí un registro DICOSE primero");
    return createOwnTagPaddockAction(farmId, name);
  }

  async function handleConfirm() {
    if (!dicoseRegistrationId || !preview || preview.mappingNeeded) return;
    const importResult = await confirmOwnTagUpload(
      dicoseRegistrationId,
      preview.headerSignature,
      preview.mapping,
      preview.rows
    );
    setResult(importResult);
    setCounts((prev) =>
      prev.map((row) =>
        row.registration.id === dicoseRegistrationId
          ? { ...row, count: row.count + importResult.inserted, lastUploadedAt: new Date().toISOString() }
          : row
      )
    );
    setPreview(null);
    setFile(null);
  }

  const remainingPaddockNames =
    preview && !preview.mappingNeeded
      ? preview.pendingPaddockNames.filter((name) => !resolvedPaddockNames.includes(name))
      : [];
  const remainingCategoryNames =
    preview && !preview.mappingNeeded
      ? preview.pendingCategoryNames.filter((name) => !resolvedCategoryNames.includes(name))
      : [];
  const hasPending = remainingPaddockNames.length > 0 || remainingCategoryNames.length > 0;

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
              <td className="py-1 pr-2">
                {row.lastUploadedAt ? new Date(row.lastUploadedAt).toLocaleDateString("es-UY") : "—"}
              </td>
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
          className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
        >
          <option value="">Elegir...</option>
          {registrations.map((registration) => (
            <option key={registration.id} value={registration.id}>
              {registration.ownerName} — {registration.farmName} ({registration.dicoseCode})
            </option>
          ))}
        </select>

        <Label htmlFor="own-tag-file">Archivo</Label>
        <Input id="own-tag-file" type="file" onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)} />

        <Button type="button" disabled={!file || !dicoseRegistrationId} onClick={() => runPreview()}>
          Subir
        </Button>

        {preview?.mappingNeeded ? (
          <ColumnMapper
            headers={preview.headers}
            availableMeanings={["tag", "sex", "category", "birthDate", "paddock", "date", "ignore"]}
            initialMapping={preview.initialMapping}
            onSubmit={(mapping) => runPreview(mapping)}
          />
        ) : null}

        {preview && !preview.mappingNeeded ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              {preview.rows.length} caravanas encontradas en el archivo.
              {ownTagMappingHasPaddock(preview.mapping)
                ? " Se van a ubicar directamente en su potrero."
                : " No mapeaste una columna de potrero, así que solo se registran (sin ubicación) hasta el próximo traslado o sanidad."}
            </p>

            {remainingPaddockNames.length > 0 ? (
              <PendingItemEditor
                title="Potreros nuevos por crear"
                buttonLabel="Crear potrero"
                defaultErrorMessage="No se pudo crear el potrero"
                pendingNames={remainingPaddockNames}
                onCreate={handleCreatePaddock}
                onResolved={(name) => setResolvedPaddockNames((prev) => [...prev, name])}
              />
            ) : null}

            {remainingCategoryNames.length > 0 ? (
              <PendingItemEditor
                title="Categorías nuevas por crear"
                buttonLabel="Crear categoría"
                defaultErrorMessage="No se pudo crear la categoría"
                pendingNames={remainingCategoryNames}
                onCreate={createOwnTagCategoryAction}
                onResolved={(name) => setResolvedCategoryNames((prev) => [...prev, name])}
              />
            ) : null}

            <Button type="button" disabled={hasPending} onClick={handleConfirm}>
              Confirmar carga
            </Button>
          </div>
        ) : null}

        {result ? (
          <p className="text-sm text-muted-foreground">
            {result.inserted} caravanas nuevas, {result.updated} actualizadas, {result.located} ubicadas,{" "}
            {result.recategorized} recategorizadas, {result.skipped} sin cambios, {result.invalid} filas inválidas
            ignoradas.
          </p>
        ) : null}
      </div>
    </div>
  );
}
