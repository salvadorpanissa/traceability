"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColumnMapper } from "@/components/activities/column-mapper";
import { RecategorizePreviewTable } from "@/components/activities/recategorize-preview-table";
import { ScrollablePreviewTable } from "@/components/activities/scrollable-preview-table";
import {
  previewRecategorizeBatch,
  confirmRecategorizeBatchAction,
  listCategoriesAction,
  type PreviewResult,
} from "@/app/(protected)/activities/recategorize/actions";
import type { ColumnMapping } from "@/lib/activities/column-mapping";
import type { RecategorizeResolvedRow, UnresolvableDecision } from "@/lib/activities/recategorize-resolution";
import type { CategoryCatalogEntry } from "@/lib/dal/category-catalog";

export function RecategorizeForm({ farms }: { farms: { id: string; name: string }[] }) {
  const [farmId, setFarmId] = useState(farms.length === 1 ? farms[0].id : "");
  const [categories, setCategories] = useState<CategoryCatalogEntry[]>([]);
  const [categoryLoadError, setCategoryLoadError] = useState("");
  const [targetCategoryId, setTargetCategoryId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [eventDate, setEventDate] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [rows, setRows] = useState<RecategorizeResolvedRow[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [globalUnresolvableDefault, setGlobalUnresolvableDefault] = useState<UnresolvableDecision>("skip");
  const [unresolvableOverrides, setUnresolvableOverrides] = useState<Record<string, UnresolvableDecision>>({});
  const [globalSexMismatchDefault, setGlobalSexMismatchDefault] = useState<UnresolvableDecision>("skip");
  const [sexMismatchOverrides, setSexMismatchOverrides] = useState<Record<string, UnresolvableDecision>>({});

  async function loadCategories(selectedFarmId: string) {
    setCategoryLoadError("");
    if (!selectedFarmId) {
      setCategories([]);
      return;
    }
    try {
      setCategories(await listCategoriesAction(selectedFarmId));
    } catch (err) {
      setCategories([]);
      setCategoryLoadError(err instanceof Error ? err.message : "No se pudieron cargar las categorías");
    }
  }

  async function handleFarmChange(selectedFarmId: string) {
    setFarmId(selectedFarmId);
    setTargetCategoryId("");
    handleFileChange(null);
    await loadCategories(selectedFarmId);
  }

  useEffect(() => {
    if (farmId) void loadCategories(farmId);
    // Only ever auto-load once, for the farm preselected when there's just one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFileChange(selected: File | null) {
    setFile(selected);
    setEventDate("");
    setPreview(null);
    setRows([]);
    setUnresolvableOverrides({});
    setSexMismatchOverrides({});
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

  const unresolvableDecisions = useMemo(() => {
    const decisions: Record<string, UnresolvableDecision> = {};
    for (const row of rows) {
      if (row.status === "age-unresolvable") {
        decisions[row.animalId] = unresolvableOverrides[row.animalId] ?? globalUnresolvableDefault;
      }
    }
    return decisions;
  }, [rows, unresolvableOverrides, globalUnresolvableDefault]);

  const targetCategorySex = categories.find((c) => c.id === targetCategoryId)?.sex ?? null;

  // A row only needs a sex decision when it's actually headed for
  // targetCategoryId (an "existing" row changing category, or an
  // "age-unresolvable" row whose age decision is "assignTarget") AND both
  // sexes are known and differ — resolveCategoryForAge already guarantees
  // "age-resolved" rows can never mismatch, so they're never in scope here.
  const sexMismatchAnimalIds = useMemo(() => {
    const ids = new Set<string>();
    if (!targetCategorySex) return ids;
    for (const row of rows) {
      if (
        row.status === "existing" &&
        row.currentCategoryId !== targetCategoryId &&
        row.sex &&
        row.sex !== targetCategorySex
      ) {
        ids.add(row.animalId);
      }
      if (
        row.status === "age-unresolvable" &&
        unresolvableDecisions[row.animalId] === "assignTarget" &&
        row.sex &&
        row.sex !== targetCategorySex
      ) {
        ids.add(row.animalId);
      }
    }
    return ids;
  }, [rows, targetCategoryId, targetCategorySex, unresolvableDecisions]);

  const sexMismatchDecisions = useMemo(() => {
    const decisions: Record<string, UnresolvableDecision> = {};
    for (const animalId of sexMismatchAnimalIds) {
      decisions[animalId] = sexMismatchOverrides[animalId] ?? globalSexMismatchDefault;
    }
    return decisions;
  }, [sexMismatchAnimalIds, sexMismatchOverrides, globalSexMismatchDefault]);

  function handleDecisionChange(animalId: string, decision: UnresolvableDecision) {
    setUnresolvableOverrides((prev) => ({ ...prev, [animalId]: decision }));
  }

  function handleSexMismatchDecisionChange(animalId: string, decision: UnresolvableDecision) {
    setSexMismatchOverrides((prev) => ({ ...prev, [animalId]: decision }));
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
        farmId,
        targetCategoryId,
        rows,
        unresolvableDecisions,
        sexMismatchDecisions,
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
  const hasSexMismatchRows = sexMismatchAnimalIds.size > 0;
  const hasConfirmableRow = rows.some((r) => {
    if (r.status === "age-resolved") return true;
    if (r.status === "existing") {
      if (r.currentCategoryId === targetCategoryId) return false;
      if (sexMismatchAnimalIds.has(r.animalId)) return sexMismatchDecisions[r.animalId] === "assignTarget";
      return true;
    }
    if (r.status === "age-unresolvable") {
      if (unresolvableDecisions[r.animalId] !== "assignTarget") return false;
      if (sexMismatchAnimalIds.has(r.animalId)) return sexMismatchDecisions[r.animalId] === "assignTarget";
      return true;
    }
    return false;
  });

  return (
    <div className="flex flex-col gap-4">
      {farms.length > 1 ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="farm">Campo</Label>
          <select
            id="farm"
            aria-label="Campo"
            value={farmId}
            onChange={(e) => handleFarmChange(e.target.value)}
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
      ) : null}
      {categoryLoadError ? <p className="text-sm text-destructive">{categoryLoadError}</p> : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="targetCategoryId">Categoría destino</Label>
        <select
          id="targetCategoryId"
          value={targetCategoryId}
          onChange={(e) => setTargetCategoryId(e.target.value)}
          disabled={!farmId}
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
        <FileInput id="file" disabled={!farmId} file={file} onChange={handleFileChange} />
      </div>
      <Button type="button" disabled={!farmId || !targetCategoryId || !file} onClick={() => runPreview()}>
        Subir
      </Button>

      {preview?.mappingNeeded ? (
        <ColumnMapper
          headers={preview.headers}
          availableMeanings={["tag", "date", "notes", "secondaryTag", "breed", "ignore"]}
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
          {hasSexMismatchRows ? (
            <div className="flex flex-col gap-1 text-sm">
              <p>Animales de sexo distinto al de la categoría destino:</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={globalSexMismatchDefault === "skip" ? "default" : "outline"}
                  onClick={() => setGlobalSexMismatchDefault("skip")}
                >
                  Omitir
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={globalSexMismatchDefault === "assignTarget" ? "default" : "outline"}
                  onClick={() => setGlobalSexMismatchDefault("assignTarget")}
                >
                  Asignar igual
                </Button>
              </div>
            </div>
          ) : null}
          <ScrollablePreviewTable>
            <RecategorizePreviewTable
              rows={rows}
              targetCategoryName={targetCategoryName}
              unresolvableDecisions={unresolvableDecisions}
              onDecisionChange={handleDecisionChange}
              sexMismatchAnimalIds={sexMismatchAnimalIds}
              sexMismatchDecisions={sexMismatchDecisions}
              onSexMismatchDecisionChange={handleSexMismatchDecisionChange}
            />
          </ScrollablePreviewTable>
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
