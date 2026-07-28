"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  previewSaleSettlement,
  linkSaleSettlementAction,
  type SettlementPreviewResult,
} from "@/app/(protected)/activities/sale-settlement/actions";

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
        <Input
          id="file"
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
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
            <dd>{preview.match.farmName}</dd>
            <dt className="text-muted-foreground">Caravanas</dt>
            <dd className="flex flex-wrap gap-x-2 gap-y-1">
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
