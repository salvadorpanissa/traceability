"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColumnMapper } from "@/components/activities/column-mapper";
import { TransferPreviewTable } from "@/components/activities/transfer-preview-table";
import { PendingOwnerEditor } from "@/components/activities/pending-owner-editor";
import {
  previewTransferBatch,
  confirmTransferBatchAction,
  createOwnerAction,
  type PreviewResult,
} from "@/app/(protected)/activities/transfer/actions";
import type { ColumnMapping } from "@/lib/activities/column-mapping";
import type { ResolvedRow } from "@/lib/activities/transfer";
import type { OwnerCatalogEntry } from "@/lib/dal/owner-catalog";

function pendingOwnerNames(rows: ResolvedRow[]): string[] {
  const names = rows
    .filter((r): r is Extract<ResolvedRow, { status: "new" }> => r.status === "new" && !!r.pendingOwnerName)
    .map((r) => r.pendingOwnerName as string);
  return Array.from(new Set(names));
}

export function TransferForm() {
  const [file, setFile] = useState<File | null>(null);
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [rows, setRows] = useState<ResolvedRow[]>([]);
  const [destinationFarmId, setDestinationFarmId] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  async function runPreview(mapping?: ColumnMapping[]) {
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    formData.set("eventDate", eventDate);
    if (mapping) formData.set("mapping", JSON.stringify(mapping));
    const result = await previewTransferBatch(formData);
    setPreview(result);
    if (!result.mappingNeeded) {
      setRows(result.rows);
    }
  }

  async function handleCreateOwner(name: string): Promise<OwnerCatalogEntry> {
    return createOwnerAction(name);
  }

  function handleOwnerResolved(rawName: string, ownerId: string) {
    setRows((prev) =>
      prev.map((r) => (r.status === "new" && r.pendingOwnerName === rawName ? { ...r, ownerId, pendingOwnerName: null } : r))
    );
  }

  async function handleConfirm() {
    if (!preview || preview.mappingNeeded) return;
    await confirmTransferBatchAction({
      headerSignature: preview.headerSignature,
      mapping: preview.mapping,
      destinationFarmId,
      destinationPaddockId: null,
      rows,
    });
    setConfirmed(true);
  }

  if (confirmed) {
    return <p>Lote confirmado.</p>;
  }

  const pendingNames = pendingOwnerNames(rows);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="file">Archivo</Label>
        <Input id="file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="eventDate">Fecha</Label>
        <Input id="eventDate" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
      </div>
      <Button type="button" onClick={() => runPreview()}>
        Subir
      </Button>

      {preview?.mappingNeeded ? (
        <ColumnMapper
          headers={preview.headers}
          availableMeanings={["tag", "date", "category", "sex", "owner", "ignore"]}
          initialMapping={preview.initialMapping}
          onSubmit={(mapping) => runPreview(mapping)}
        />
      ) : null}

      {preview && !preview.mappingNeeded ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="destinationFarm">Campo destino</Label>
            <Input
              id="destinationFarm"
              value={destinationFarmId}
              onChange={(e) => setDestinationFarmId(e.target.value)}
              placeholder="ID del campo destino"
            />
          </div>
          <PendingOwnerEditor pendingNames={pendingNames} onCreateOwner={handleCreateOwner} onResolved={handleOwnerResolved} />
          <TransferPreviewTable rows={rows} />
          <Button
            type="button"
            disabled={rows.some((r) => r.status === "error") || !destinationFarmId || pendingNames.length > 0}
            onClick={handleConfirm}
          >
            Confirmar
          </Button>
        </div>
      ) : null}
    </div>
  );
}
