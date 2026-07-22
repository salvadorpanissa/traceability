"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColumnMapper } from "@/components/activities/column-mapper";
import { TransferPreviewTable } from "@/components/activities/transfer-preview-table";
import { PendingOwnerEditor } from "@/components/activities/pending-owner-editor";
import { PaddockSelector } from "@/components/activities/paddock-selector";
import {
  previewTransferBatch,
  confirmTransferBatchAction,
  createOwnerAction,
  listPaddocksAction,
  createPaddockAction,
  type PreviewResult,
} from "@/app/(protected)/activities/transfer/actions";
import type { ColumnMapping } from "@/lib/activities/column-mapping";
import type { ResolvedRow } from "@/lib/activities/transfer";
import type { OwnerCatalogEntry } from "@/lib/dal/owner-catalog";
import type { PaddockCatalogEntry } from "@/lib/dal/paddock-catalog";

function pendingOwnerNames(rows: ResolvedRow[]): string[] {
  const names: string[] = [];
  for (const row of rows) {
    if (row.status === "new" && row.pendingOwnerName) names.push(row.pendingOwnerName);
    if (row.status === "foreign" && row.forced && row.pendingOwnerName) names.push(row.pendingOwnerName);
  }
  return Array.from(new Set(names));
}

export function TransferForm({ farms }: { farms: { id: string; name: string }[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [eventDate, setEventDate] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [rows, setRows] = useState<ResolvedRow[]>([]);
  const [destinationFarmId, setDestinationFarmId] = useState("");
  const [paddocks, setPaddocks] = useState<PaddockCatalogEntry[]>([]);
  const [destinationPaddockId, setDestinationPaddockId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  function handleFileChange(selected: File | null) {
    setFile(selected);
    setEventDate("");
  }

  async function runPreview(mapping?: ColumnMapping[]) {
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    formData.set("eventDate", eventDate);
    if (mapping) formData.set("mapping", JSON.stringify(mapping));
    const result = await previewTransferBatch(formData);
    setPreview(result);
    if (!result.mappingNeeded && !result.eventDateNeeded) {
      setRows(result.rows);
    }
  }

  async function handleSubmitEventDate() {
    if (!preview || preview.mappingNeeded || !preview.eventDateNeeded) return;
    await runPreview(preview.mapping);
  }

  async function handleDestinationFarmChange(farmId: string) {
    setDestinationFarmId(farmId);
    setDestinationPaddockId(null);
    if (!farmId) {
      setPaddocks([]);
      return;
    }
    setPaddocks(await listPaddocksAction(farmId));
  }

  async function handleCreatePaddock(name: string): Promise<PaddockCatalogEntry> {
    const created = await createPaddockAction(destinationFarmId, name);
    setPaddocks((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
  }

  async function handleCreateOwner(name: string): Promise<OwnerCatalogEntry> {
    return createOwnerAction(name);
  }

  function handleOwnerResolved(rawName: string, ownerId: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.status === "new" && r.pendingOwnerName === rawName) return { ...r, ownerId, pendingOwnerName: null };
        if (r.status === "foreign" && r.pendingOwnerName === rawName) return { ...r, ownerId, pendingOwnerName: null };
        return r;
      })
    );
  }

  function handleToggleForced(tag: string) {
    setRows((prev) => prev.map((r) => (r.status === "foreign" && r.tag === tag ? { ...r, forced: !r.forced } : r)));
  }

  async function handleConfirm() {
    if (!preview || preview.mappingNeeded || preview.eventDateNeeded) return;
    await confirmTransferBatchAction({
      headerSignature: preview.headerSignature,
      mapping: preview.mapping,
      destinationFarmId,
      destinationPaddockId,
      rows,
    });
    setConfirmed(true);
  }

  if (confirmed) {
    return <p>Lote confirmado.</p>;
  }

  const pendingNames = pendingOwnerNames(rows);
  const hasConfirmableRow = rows.some(
    (r) =>
      r.status === "new" || r.status === "existing" || r.status === "wrong_farm" || (r.status === "foreign" && r.forced)
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="file">Archivo</Label>
        <Input id="file" type="file" onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)} />
      </div>
      <Button type="button" onClick={() => runPreview()}>
        Subir
      </Button>

      {preview?.mappingNeeded ? (
        <ColumnMapper
          headers={preview.headers}
          availableMeanings={["tag", "date", "category", "sex", "owner", "notes", "ignore"]}
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="destinationFarm">Campo destino</Label>
            <select
              id="destinationFarm"
              aria-label="Campo destino"
              value={destinationFarmId}
              onChange={(e) => handleDestinationFarmChange(e.target.value)}
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
          {destinationFarmId ? (
            <PaddockSelector
              paddocks={paddocks}
              paddockId={destinationPaddockId}
              onChange={setDestinationPaddockId}
              onCreatePaddock={handleCreatePaddock}
            />
          ) : null}
          <PendingOwnerEditor pendingNames={pendingNames} onCreateOwner={handleCreateOwner} onResolved={handleOwnerResolved} />
          <TransferPreviewTable rows={rows} onToggleForced={handleToggleForced} />
          <Button
            type="button"
            disabled={
              rows.some((r) => r.status === "error") || !destinationFarmId || pendingNames.length > 0 || !hasConfirmableRow
            }
            onClick={handleConfirm}
          >
            Confirmar
          </Button>
        </div>
      ) : null}
    </div>
  );
}
