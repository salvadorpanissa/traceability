"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PendingOwnerEditor } from "@/components/activities/pending-owner-editor";
import { TransferPreviewTable } from "@/components/activities/transfer-preview-table";
import {
  previewSaleBatchFromPdf,
  confirmSaleBatchFromPdfAction,
  createOwnerAction,
  type PdfPreviewResult,
} from "@/app/(protected)/activities/sale/actions";
import type { ResolvedRow } from "@/lib/activities/sale";
import type { OwnerCatalogEntry } from "@/lib/dal/owner-catalog";

// Local re-implementation rather than importing a runtime value from
// "@/lib/activities/sale" (only its ResolvedRow *type* is imported above) —
// that module also pulls in the server-only `db` client, and a "use client"
// component importing a value from it (not just the type) drags `pg` into
// the browser bundle. Same pattern as pdf-guide-transfer-form.tsx and
// health-form.tsx.
function pendingOwnerNames(rows: ResolvedRow[]): string[] {
  const names: string[] = [];
  for (const row of rows) {
    if (row.status === "new" && row.pendingOwnerName) names.push(row.pendingOwnerName);
    if (row.status === "foreign" && row.forced && row.pendingOwnerName) names.push(row.pendingOwnerName);
  }
  return Array.from(new Set(names));
}

export function SaleForm() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PdfPreviewResult | null>(null);
  const [rows, setRows] = useState<ResolvedRow[]>([]);
  const [buyer, setBuyer] = useState("");
  const [price, setPrice] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [forcedWithdrawalTags, setForcedWithdrawalTags] = useState<Set<string>>(new Set());
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleUpload() {
    if (!file) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const result = await previewSaleBatchFromPdf(formData);
      setPreview(result);
      if (result.ok) {
        setRows(result.rows);
        setForcedWithdrawalTags(new Set());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateOwner(name: string): Promise<OwnerCatalogEntry> {
    if (!preview?.ok) throw new Error("No hay campo de origen resuelto");
    return createOwnerAction(preview.originEstablishmentId, name);
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

  function handleToggleWithdrawalForced(tag: string) {
    setForcedWithdrawalTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  async function handleConfirm() {
    if (!preview?.ok || !file) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("originEstablishmentId", preview.originEstablishmentId);
      formData.set("guideNumber", preview.guideNumber);
      formData.set("buyer", buyer);
      formData.set("price", price);
      formData.set("weightKg", weightKg);
      formData.set("forcedWithdrawalTags", JSON.stringify(Array.from(forcedWithdrawalTags)));
      formData.set("rows", JSON.stringify(rows));
      await confirmSaleBatchFromPdfAction(formData);
      setConfirmed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (confirmed) {
    return <p>Venta confirmada.</p>;
  }

  const pendingNames = pendingOwnerNames(rows);
  const hasConfirmableRow = rows.some(
    (r) =>
      r.status === "new" || r.status === "existing" || r.status === "wrong_establishment" || (r.status === "foreign" && r.forced)
  );
  const withdrawalWarnings = preview?.ok ? preview.withdrawalWarnings : [];
  const hasUnresolvedWithdrawal = withdrawalWarnings.some((w) => !forcedWithdrawalTags.has(w.tag));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="file">Archivo</Label>
        <FileInput
          id="file"
          accept="application/pdf"
          file={file}
          onChange={(selected) => {
            setFile(selected);
            setPreview(null);
            setRows([]);
            setForcedWithdrawalTags(new Set());
          }}
        />
      </div>
      <Button type="button" disabled={!file || isSubmitting} onClick={handleUpload}>
        Subir
      </Button>

      {preview && !preview.ok ? <p className="text-sm text-destructive">{preview.error}</p> : null}
      {error && !preview?.ok ? <p className="text-sm text-destructive">{error}</p> : null}

      {preview?.ok ? (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Guía</dt>
            <dd>{preview.guideNumber}</dd>
            <dt className="text-muted-foreground">Fecha</dt>
            <dd>{preview.eventDate}</dd>
            <dt className="text-muted-foreground">Campo origen</dt>
            <dd>{preview.originEstablishmentName}</dd>
          </dl>

          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="buyer">Comprador</Label>
              <Input id="buyer" value={buyer} onChange={(e) => setBuyer(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="price">Precio</Label>
              <Input id="price" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="weightKg">Peso (kg)</Label>
              <Input id="weightKg" type="number" step="0.01" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
            </div>
          </div>

          <PendingOwnerEditor pendingNames={pendingNames} onCreateOwner={handleCreateOwner} onResolved={handleOwnerResolved} />

          {withdrawalWarnings.length > 0 ? (
            <div className="rounded-lg border border-amber-500 bg-amber-50 p-3 text-sm">
              <p className="mb-2 font-medium">Caravanas con carencia de sanidad pendiente:</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="py-1 pr-2">Caravana</th>
                    <th className="py-1 pr-2">Medicamento</th>
                    <th className="py-1 pr-2">Carencia hasta</th>
                    <th className="py-1 pr-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {withdrawalWarnings.map((w) => (
                    <tr key={`${w.tag}-${w.productName}-${w.restrictionEndDate}`}>
                      <td className="py-1 pr-2">{w.tag}</td>
                      <td className="py-1 pr-2">{w.productName}</td>
                      <td className="py-1 pr-2">{w.restrictionEndDate}</td>
                      <td className="py-1 pr-2">
                        <label className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={forcedWithdrawalTags.has(w.tag)}
                            onChange={() => handleToggleWithdrawalForced(w.tag)}
                          />
                          Vender igual
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <TransferPreviewTable rows={rows} onToggleForced={handleToggleForced} />
          <Button
            type="button"
            disabled={
              isSubmitting ||
              rows.some((r) => r.status === "error") ||
              pendingNames.length > 0 ||
              !hasConfirmableRow ||
              hasUnresolvedWithdrawal
            }
            onClick={handleConfirm}
          >
            Confirmar
          </Button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
