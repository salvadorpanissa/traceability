"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { ColumnMapper } from "@/components/activities/column-mapper";
import { StepHeading } from "@/components/activities/step-heading";
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

type RecategorizeFormStep = "mapping" | "eventDate" | "review";

function stepFromPreview(result: PreviewResult): RecategorizeFormStep {
  if (result.mappingNeeded) return "mapping";
  if (result.eventDateNeeded) return "eventDate";
  return "review";
}

const STEP_LABELS: Record<RecategorizeFormStep, string> = {
  mapping: "Mapeo de columnas",
  eventDate: "Fecha del lote",
  review: "Caravanas y confirmación",
};

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

// A category can be sex-specific or apply to both (sex === null); the
// dropdown for each sex offers its own categories plus the sex-agnostic ones.
function categoriesForSex(categories: CategoryCatalogEntry[], sex: "male" | "female"): CategoryCatalogEntry[] {
  return categories.filter((c) => c.sex === null || c.sex === sex);
}

export function RecategorizeForm({ farms }: { farms: { id: string; name: string }[] }) {
  const [farmId, setFarmId] = useState(farms.length === 1 ? farms[0].id : "");
  const [categories, setCategories] = useState<CategoryCatalogEntry[]>([]);
  const [categoryLoadError, setCategoryLoadError] = useState("");
  const [maleTargetCategoryId, setMaleTargetCategoryId] = useState("");
  const [femaleTargetCategoryId, setFemaleTargetCategoryId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [eventDate, setEventDate] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [rows, setRows] = useState<RecategorizeResolvedRow[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [globalUnresolvableDefault, setGlobalUnresolvableDefault] = useState<UnresolvableDecision>("skip");
  const [unresolvableOverrides, setUnresolvableOverrides] = useState<Record<string, UnresolvableDecision>>({});
  const [step, setStep] = useState<RecategorizeFormStep | null>(null);
  const [stepHistory, setStepHistory] = useState<RecategorizeFormStep[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [workingMapping, setWorkingMapping] = useState<ColumnMapping[] | null>(null);

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
    setMaleTargetCategoryId("");
    setFemaleTargetCategoryId("");
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
    setStep(null);
    setStepHistory([]);
    setHeaders([]);
    setWorkingMapping(null);
  }

  async function runPreview(mapping?: ColumnMapping[]) {
    if (!file || !farmId) return;
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("eventDate", eventDate);
      formData.set("farmId", farmId);
      if (mapping) formData.set("mapping", JSON.stringify(mapping));
      const result = await previewRecategorizeBatch(formData);
      setStepHistory((prev) => (step ? [...prev, step] : prev));
      setStep(stepFromPreview(result));
      setPreview(result);
      if (result.mappingNeeded) {
        setHeaders(result.headers);
        return;
      }
      setWorkingMapping(result.mapping);
      if (result.eventDateNeeded) {
        setEventDate((prev) => prev || todayISODate());
        return;
      }
      setRows(result.rows);
    } catch (err) {
      toast({ type: "error", title: err instanceof Error ? err.message : "Ocurrió un error" });
    }
  }

  function handleBack() {
    setStepHistory((prev) => {
      if (prev.length === 0) return prev;
      setStep(prev[prev.length - 1]);
      return prev.slice(0, -1);
    });
  }

  async function handleSubmitEventDate() {
    if (step !== "eventDate" || !workingMapping) return;
    await runPreview(workingMapping);
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

  function targetCategoryIdForSex(sex: "male" | "female" | null): string | null {
    if (sex === "male") return maleTargetCategoryId || null;
    if (sex === "female") return femaleTargetCategoryId || null;
    return null;
  }

  async function doConfirm() {
    if (step !== "review" || !workingMapping) return;
    setIsSubmitting(true);
    try {
      await confirmRecategorizeBatchAction({
        mapping: workingMapping,
        farmId,
        targetCategoryIdBySex: { male: maleTargetCategoryId || null, female: femaleTargetCategoryId || null },
        rows,
        unresolvableDecisions,
      });
      setConfirmed(true);
      toast({ type: "success", title: "Lote confirmado." });
    } catch (err) {
      toast({ type: "error", title: err instanceof Error ? err.message : "Ocurrió un error" });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleConfirm() {
    if (step !== "review" || !workingMapping) return;
    setConfirmDialogOpen(true);
  }

  if (confirmed) {
    return <p>Lote confirmado.</p>;
  }

  const maleCategoryName = categories.find((c) => c.id === maleTargetCategoryId)?.name ?? null;
  const femaleCategoryName = categories.find((c) => c.id === femaleTargetCategoryId)?.name ?? null;
  const hasUnresolvableRows = rows.some((r) => r.status === "age-unresolvable");
  const hasConfirmableRow = rows.some((r) => {
    if (r.status === "age-resolved") return true;
    if (r.status === "existing") {
      const target = targetCategoryIdForSex(r.sex);
      if (!target || r.currentCategoryId === target) return false;
      return true;
    }
    if (r.status === "age-unresolvable") {
      if (unresolvableDecisions[r.animalId] !== "assignTarget") return false;
      return !!targetCategoryIdForSex(r.sex);
    }
    return false;
  });

  return (
    <div className="flex flex-col gap-4">
      {!step ? (
        <>
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
            <Label htmlFor="file">Archivo</Label>
            <FileInput id="file" disabled={!farmId} file={file} onChange={handleFileChange} />
          </div>
          <Button type="button" disabled={!farmId || !file} onClick={() => runPreview()}>
            Subir
          </Button>
        </>
      ) : null}

      {step === "mapping" ? (
        <div className="flex flex-col gap-2">
          <StepHeading label={STEP_LABELS.mapping} position={stepHistory.length + 1} />
          <ColumnMapper
            headers={headers}
            availableMeanings={["tag", "date", "notes", "secondaryTag", "breed", "ignore"]}
            initialMapping={workingMapping ?? (preview?.mappingNeeded ? preview.initialMapping : null)}
            onSubmit={(mapping) => runPreview(mapping)}
          />
          {stepHistory.length > 0 ? (
            <Button type="button" variant="outline" onClick={handleBack}>
              Atrás
            </Button>
          ) : null}
        </div>
      ) : null}

      {step === "eventDate" ? (
        <div className="flex flex-col gap-2">
          <StepHeading label={STEP_LABELS.eventDate} position={stepHistory.length + 1} />
          <p className="text-sm text-muted-foreground">
            El archivo no tiene una columna de fecha — indicá la fecha para todo el lote.
          </p>
          <Label htmlFor="eventDate">Fecha del lote</Label>
          <Input id="eventDate" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          <div className="flex gap-2">
            {stepHistory.length > 0 ? (
              <Button type="button" variant="outline" onClick={handleBack}>
                Atrás
              </Button>
            ) : null}
            <Button type="button" disabled={!eventDate} onClick={handleSubmitEventDate}>
              Continuar
            </Button>
          </div>
        </div>
      ) : null}

      {step === "review" ? (
        <div className="flex flex-col gap-4">
          <StepHeading label={STEP_LABELS.review} position={stepHistory.length + 1} />
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="maleTargetCategoryId">Categoría destino (machos)</Label>
              <select
                id="maleTargetCategoryId"
                value={maleTargetCategoryId}
                onChange={(e) => setMaleTargetCategoryId(e.target.value)}
                className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
              >
                <option value="">Sin cambios</option>
                {categoriesForSex(categories, "male").map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="femaleTargetCategoryId">Categoría destino (hembras)</Label>
              <select
                id="femaleTargetCategoryId"
                value={femaleTargetCategoryId}
                onChange={(e) => setFemaleTargetCategoryId(e.target.value)}
                className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
              >
                <option value="">Sin cambios</option>
                {categoriesForSex(categories, "female").map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
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
          <ScrollablePreviewTable>
            <RecategorizePreviewTable
              rows={rows}
              targetCategoryNameBySex={{ male: maleCategoryName, female: femaleCategoryName }}
              unresolvableDecisions={unresolvableDecisions}
              onDecisionChange={handleDecisionChange}
            />
          </ScrollablePreviewTable>
          <div className="flex gap-2">
            {stepHistory.length > 0 ? (
              <Button type="button" variant="outline" onClick={handleBack}>
                Atrás
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={
                isSubmitting ||
                (!maleTargetCategoryId && !femaleTargetCategoryId) ||
                rows.some((r) => r.status === "error") ||
                !hasConfirmableRow
              }
              onClick={handleConfirm}
            >
              Confirmar
            </Button>
          </div>
          <ConfirmDialog
            open={confirmDialogOpen}
            onOpenChange={setConfirmDialogOpen}
            title="¿Confirmar recategorización?"
            description="Se va a registrar este lote de recategorización. Esta acción no se puede deshacer."
            confirmLabel="Confirmar"
            cancelLabel="Cancelar"
            variant="destructive"
            onConfirm={doConfirm}
          />
        </div>
      ) : null}
    </div>
  );
}
