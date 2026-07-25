"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColumnMapper } from "@/components/activities/column-mapper";
import { RecategorizePreviewTable } from "@/components/activities/recategorize-preview-table";
import {
  previewRecategorizeBatch,
  confirmRecategorizeBatchAction,
  type PreviewResult,
} from "@/app/(protected)/activities/recategorize/actions";
import type { ColumnMapping } from "@/lib/activities/column-mapping";
import type { RecategorizeResolvedRow } from "@/lib/activities/recategorize-resolution";
import type { CategoryCatalogEntry } from "@/lib/dal/category-catalog";

export function RecategorizeForm({
  farms,
  categories,
}: {
  farms: { id: string; name: string }[];
  categories: CategoryCatalogEntry[];
}) {
  const [farmId, setFarmId] = useState("");
  const [targetCategoryId, setTargetCategoryId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [eventDate, setEventDate] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [rows, setRows] = useState<RecategorizeResolvedRow[]>([]);
  const [confirmed, setConfirmed] = useState(false);

  function handleFileChange(selected: File | null) {
    setFile(selected);
    setEventDate("");
    setPreview(null);
    setRows([]);
  }

  async function runPreview(mapping?: ColumnMapping[]) {
    if (!file || !farmId) return;
    const formData = new FormData();
    formData.set("file", file);
    formData.set("eventDate", eventDate);
    formData.set("farmId", farmId);
    if (mapping) formData.set("mapping", JSON.stringify(mapping));
    const result = await previewRecategorizeBatch(formData);
    setPreview(result);
    if (!result.mappingNeeded && !result.eventDateNeeded) {
      setRows(result.rows);
    }
  }

  async function handleSubmitEventDate() {
    if (!preview || preview.mappingNeeded || !preview.eventDateNeeded) return;
    await runPreview(preview.mapping);
  }

  async function handleConfirm() {
    if (!preview || preview.mappingNeeded || preview.eventDateNeeded) return;
    await confirmRecategorizeBatchAction({
      headerSignature: preview.headerSignature,
      mapping: preview.mapping,
      targetCategoryId,
      farmId,
      rows,
    });
    setConfirmed(true);
  }

  if (confirmed) {
    return <p>Lote confirmado.</p>;
  }

  const targetCategoryName = categories.find((c) => c.id === targetCategoryId)?.name ?? "";
  const hasConfirmableRow = rows.some((r) => r.status === "existing");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="farmId">Campo</Label>
        <select
          id="farmId"
          value={farmId}
          onChange={(e) => {
            setFarmId(e.target.value);
            setPreview(null);
            setRows([]);
          }}
          className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
        >
          <option value="">Elegir campo</option>
          {farms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="targetCategoryId">Categoría destino</Label>
        <select
          id="targetCategoryId"
          value={targetCategoryId}
          onChange={(e) => setTargetCategoryId(e.target.value)}
          className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
        >
          <option value="">Elegir categoría</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="file">Archivo</Label>
        <Input id="file" type="file" onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)} />
      </div>
      <Button type="button" disabled={!farmId || !targetCategoryId || !file} onClick={() => runPreview()}>
        Subir
      </Button>

      {preview?.mappingNeeded ? (
        <ColumnMapper
          headers={preview.headers}
          availableMeanings={["tag", "date", "notes", "ignore"]}
          initialMapping={preview.initialMapping}
          onSubmit={(mapping) => runPreview(mapping)}
        />
      ) : null}

      {preview && !preview.mappingNeeded && preview.eventDateNeeded ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            El archivo no tiene una columna de fecha — indicá la fecha para todo el lote.
          </p>
          <Label htmlFor="eventDate">Fecha del lote</Label>
          <Input id="eventDate" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          <Button type="button" disabled={!eventDate} onClick={handleSubmitEventDate}>
            Continuar
          </Button>
        </div>
      ) : null}

      {preview && !preview.mappingNeeded && !preview.eventDateNeeded ? (
        <div className="flex flex-col gap-4">
          <RecategorizePreviewTable rows={rows} targetCategoryName={targetCategoryName} />
          <Button
            type="button"
            disabled={rows.some((r) => r.status === "error") || !hasConfirmableRow}
            onClick={handleConfirm}
          >
            Confirmar
          </Button>
        </div>
      ) : null}
    </div>
  );
}
