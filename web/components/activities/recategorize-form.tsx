"use client";

import { useMemo, useState } from "react";
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
import type { RecategorizeResolvedRow, UnresolvableDecision } from "@/lib/activities/recategorize-resolution";
import type { CategoryCatalogEntry } from "@/lib/dal/category-catalog";

export function RecategorizeForm({ categories }: { categories: CategoryCatalogEntry[] }) {
  const [targetCategoryId, setTargetCategoryId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [eventDate, setEventDate] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [rows, setRows] = useState<RecategorizeResolvedRow[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [globalUnresolvableDefault, setGlobalUnresolvableDefault] = useState<UnresolvableDecision>("skip");
  const [unresolvableOverrides, setUnresolvableOverrides] = useState<Record<string, UnresolvableDecision>>({});

  function handleFileChange(selected: File | null) {
    setFile(selected);
    setEventDate("");
    setPreview(null);
    setRows([]);
    setUnresolvableOverrides({});
  }

  async function runPreview(mapping?: ColumnMapping[]) {
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    formData.set("eventDate", eventDate);
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

  const unresolvableDecisions = useMemo(() => {
    const decisions: Record<string, UnresolvableDecision> = {};
    for (const row of rows) {
      if (row.status === "age-unresolvable") {
        decisions[row.animalId] = unresolvableOverrides[row.animalId] ?? globalUnresolvableDefault;
      }
    }
    return decisions;
  }, [rows, unresolvableOverrides, globalUnresolvableDefault]);

  function handleDecisionChange(animalId: string, decision: UnresolvableDecision) {
    setUnresolvableOverrides((prev) => ({ ...prev, [animalId]: decision }));
  }

  async function handleConfirm() {
    if (!preview || preview.mappingNeeded || preview.eventDateNeeded) return;
    // Confirm now fails for routine reasons (a campo the user can't touch, a
    // preview that went stale, one campo of several failing to write), so the
    // message has to reach the user instead of becoming an unhandled rejection
    // that silently deadens the button.
    setConfirmError(null);
    try {
      await confirmRecategorizeBatchAction({
        headerSignature: preview.headerSignature,
        mapping: preview.mapping,
        targetCategoryId,
        rows,
        unresolvableDecisions,
      });
      setConfirmed(true);
    } catch (error) {
      setConfirmError(error instanceof Error ? error.message : "No se pudo confirmar el lote.");
    }
  }

  if (confirmed) {
    return <p>Lote confirmado.</p>;
  }

  const targetCategoryName = categories.find((c) => c.id === targetCategoryId)?.name ?? "";
  const hasUnresolvableRows = rows.some((r) => r.status === "age-unresolvable");
  const hasConfirmableRow = rows.some(
    (r) =>
      (r.status === "existing" && r.currentCategoryId !== targetCategoryId) ||
      r.status === "age-resolved" ||
      (r.status === "age-unresolvable" && unresolvableDecisions[r.animalId] === "assignTarget")
  );

  return (
    <div className="flex flex-col gap-4">
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
      <Button type="button" disabled={!targetCategoryId || !file} onClick={() => runPreview()}>
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
          {hasUnresolvableRows ? (
            <div className="flex flex-col gap-1 text-sm">
              <p>Animales sin categoría y sin edad calculable:</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={globalUnresolvableDefault === "skip" ? "default" : "outline"}
                  onClick={() => setGlobalUnresolvableDefault("skip")}
                >
                  Omitir
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={globalUnresolvableDefault === "assignTarget" ? "default" : "outline"}
                  onClick={() => setGlobalUnresolvableDefault("assignTarget")}
                >
                  Asignar categoría destino
                </Button>
              </div>
            </div>
          ) : null}
          <RecategorizePreviewTable
            rows={rows}
            targetCategoryName={targetCategoryName}
            unresolvableDecisions={unresolvableDecisions}
            onDecisionChange={handleDecisionChange}
          />
          <Button
            type="button"
            disabled={rows.some((r) => r.status === "error") || !hasConfirmableRow}
            onClick={handleConfirm}
          >
            Confirmar
          </Button>
          {confirmError ? <p className="text-sm text-destructive">{confirmError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
