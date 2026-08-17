"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { Label } from "@/components/ui/label";
import {
  previewSaleSettlement,
  linkSaleSettlementAction,
  type SettlementPreviewResult,
} from "@/app/(protected)/activities/sale-settlement/actions";

const FRIGORIFICO = "Cledinor S.A.";

// What the confirm step is about to do with a field on the venta: leave the
// existing value alone, fill in the blank with the liquidación's value, or
// leave it blank because the liquidación couldn't determine one.
function describeBackfill(current: string | null, fromSettlement: string | null): string {
  if (current !== null) return `${current} (ya cargado, no se modifica)`;
  if (fromSettlement !== null) return `${fromSettlement} (se va a completar)`;
  return "no se pudo determinar (varias categorías en la liquidación)";
}

export function SaleSettlementForm() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<SettlementPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [linked, setLinked] = useState(false);

  async function handleUpload() {
    if (!file) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const result = await previewSaleSettlement(formData);
      setPreview(result);
      if (!result.ok) setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLink() {
    if (!file || !preview?.ok) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      await linkSaleSettlementAction(formData);
      setLinked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (linked) {
    return <p>Liquidación vinculada.</p>;
  }

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
            setError(null);
          }}
        />
      </div>
      <Button type="button" disabled={!file || isSubmitting} onClick={handleUpload}>
        Subir
      </Button>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {preview?.ok ? (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Guía</dt>
            <dd>{preview.guideNumber}</dd>
            <dt className="text-muted-foreground">Fecha de pesada</dt>
            <dd>{preview.weighDate}</dd>
            <dt className="text-muted-foreground">Total</dt>
            <dd>{preview.total}</dd>
            <dt className="text-muted-foreground">Campo</dt>
            <dd>{preview.match.establishmentName}</dd>
            <dt className="text-muted-foreground">Fecha de la venta</dt>
            <dd>{preview.match.eventDate}</dd>
            <dt className="text-muted-foreground">Comprador</dt>
            <dd>{describeBackfill(preview.match.buyer, FRIGORIFICO)}</dd>
            <dt className="text-muted-foreground">Precio</dt>
            <dd>{describeBackfill(preview.match.price, preview.pricePerKg)}</dd>
            <dt className="text-muted-foreground">Peso</dt>
            <dd>{describeBackfill(preview.match.weightKg, preview.weightKg)}</dd>
            <dt className="text-muted-foreground">Caravanas</dt>
            <dd className="flex max-h-40 flex-wrap gap-x-2 gap-y-1 overflow-y-auto">
              {preview.match.animalTags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </dd>
          </dl>
          <Button type="button" disabled={isSubmitting} onClick={handleLink}>
            Vincular
          </Button>
        </div>
      ) : null}
    </div>
  );
}
