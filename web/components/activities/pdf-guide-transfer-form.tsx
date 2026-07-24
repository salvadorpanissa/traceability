"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PendingOwnerEditor } from "@/components/activities/pending-owner-editor";
import { PaddockSelector } from "@/components/activities/paddock-selector";
import { TransferPreviewTable } from "@/components/activities/transfer-preview-table";
import {
  previewTransferBatchFromPdf,
  confirmTransferBatchFromPdfAction,
  createOwnerAction,
  listPaddocksAction,
  createPaddockAction,
  type PdfPreviewResult,
} from "@/app/(protected)/activities/transfer/actions";
import type { ResolvedRow } from "@/lib/activities/transfer";
import type { OwnerCatalogEntry } from "@/lib/dal/owner-catalog";
import type { PaddockCatalogEntry } from "@/lib/dal/paddock-catalog";

// Local, dependency-free re-implementation rather than importing the runtime
// export from "@/lib/activities/transfer": that module also pulls in the
// server-only `db` client (pg), and a "use client" component importing a
// *value* from it (not just the type) drags pg into the browser bundle,
// which breaks (pg needs node builtins like "net"/"tls"/"dns"). Same pattern
// as components/activities/health-form.tsx and transfer-form.tsx.
function pendingOwnerNames(rows: ResolvedRow[]): string[] {
  const names: string[] = [];
  for (const row of rows) {
    if (row.status === "new" && row.pendingOwnerName) names.push(row.pendingOwnerName);
    if (row.status === "foreign" && row.forced && row.pendingOwnerName) names.push(row.pendingOwnerName);
  }
  return Array.from(new Set(names));
}

export function PdfGuideTransferForm({ farms: _farms }: { farms: { id: string; name: string }[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PdfPreviewResult | null>(null);
  const [rows, setRows] = useState<ResolvedRow[]>([]);
  const [paddocks, setPaddocks] = useState<PaddockCatalogEntry[]>([]);
  const [destinationPaddockId, setDestinationPaddockId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  async function handleUpload() {
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    const result = await previewTransferBatchFromPdf(formData);
    setPreview(result);
    if (result.ok) {
      setRows(result.rows);
      setPaddocks(await listPaddocksAction(result.destinationFarmId));
    }
  }

  async function handleCreatePaddock(name: string): Promise<PaddockCatalogEntry> {
    if (!preview?.ok) throw new Error("Subí una guía primero");
    const created = await createPaddockAction(preview.destinationFarmId, name);
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
    if (!preview?.ok) return;
    await confirmTransferBatchFromPdfAction({
      originFarmId: preview.originFarmId,
      destinationFarmId: preview.destinationFarmId,
      destinationPaddockId,
      guideNumber: preview.guideNumber,
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
        <Input
          id="file"
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
            setRows([]);
          }}
        />
      </div>
      <Button type="button" disabled={!file} onClick={handleUpload}>
        Subir
      </Button>

      {preview && !preview.ok ? <p className="text-sm text-destructive">{preview.error}</p> : null}

      {preview?.ok ? (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Guía</dt>
            <dd>{preview.guideNumber}</dd>
            <dt className="text-muted-foreground">Fecha</dt>
            <dd>{preview.eventDate}</dd>
            <dt className="text-muted-foreground">Campo origen</dt>
            <dd>{preview.originFarmName}</dd>
            <dt className="text-muted-foreground">Campo destino</dt>
            <dd>{preview.destinationFarmName}</dd>
          </dl>
          <PaddockSelector
            paddocks={paddocks}
            paddockId={destinationPaddockId}
            onChange={setDestinationPaddockId}
            onCreatePaddock={handleCreatePaddock}
          />
          <PendingOwnerEditor pendingNames={pendingNames} onCreateOwner={handleCreateOwner} onResolved={handleOwnerResolved} />
          <TransferPreviewTable rows={rows} onToggleForced={handleToggleForced} />
          <Button
            type="button"
            disabled={rows.some((r) => r.status === "error") || pendingNames.length > 0 || !hasConfirmableRow}
            onClick={handleConfirm}
          >
            Confirmar
          </Button>
        </div>
      ) : null}
    </div>
  );
}
