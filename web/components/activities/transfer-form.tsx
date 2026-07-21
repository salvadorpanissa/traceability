"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColumnMapper } from "@/components/activities/column-mapper";
import { TransferPreviewTable } from "@/components/activities/transfer-preview-table";
import {
  previewTransferBatch,
  confirmTransferBatchAction,
  type PreviewResult,
} from "@/app/(protected)/activities/transfer/actions";
import type { ColumnMapping } from "@/lib/activities/column-mapping";

export function TransferForm() {
  const [file, setFile] = useState<File | null>(null);
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState<PreviewResult | null>(null);
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
  }

  async function handleConfirm() {
    if (!preview || preview.mappingNeeded) return;
    await confirmTransferBatchAction({
      headerSignature: preview.headerSignature,
      mapping: preview.mapping,
      destinationFarmId,
      destinationPaddockId: null,
      rows: preview.rows,
    });
    setConfirmed(true);
  }

  if (confirmed) {
    return <p>Lote confirmado.</p>;
  }

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
        <ColumnMapper headers={preview.headers} onSubmit={(mapping) => runPreview(mapping)} />
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
          <TransferPreviewTable rows={preview.rows} />
          <Button
            type="button"
            disabled={preview.rows.some((r) => r.status === "error") || !destinationFarmId}
            onClick={handleConfirm}
          >
            Confirmar
          </Button>
        </div>
      ) : null}
    </div>
  );
}
