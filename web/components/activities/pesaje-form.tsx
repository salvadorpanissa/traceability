"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { ColumnMapper } from "@/components/activities/column-mapper";
import { StepHeading } from "@/components/activities/step-heading";
import { PaddockSelector } from "@/components/activities/paddock-selector";
import { PesajePreviewTable } from "@/components/activities/pesaje-preview-table";
import { ScrollablePreviewTable } from "@/components/activities/scrollable-preview-table";
import {
  previewPesajeBatch,
  previewPesajeTropaBatch,
  confirmPesajeBatchAction,
  listPesajePaddocksAction,
  createPesajePaddockAction,
  type PreviewResult,
} from "@/app/(protected)/activities/pesaje/actions";
import type { ColumnMapping } from "@/lib/activities/column-mapping";
import type { PesajeResolvedRow } from "@/lib/activities/pesaje-resolution";
import type { PaddockCatalogEntry } from "@/lib/dal/paddock-catalog";

type PesajeFormStep = "mapping" | "eventDate" | "review";

function stepFromPreview(result: PreviewResult): PesajeFormStep {
  if (result.mappingNeeded) return "mapping";
  if (result.eventDateNeeded) return "eventDate";
  return "review";
}

const STEP_LABELS: Record<PesajeFormStep, string> = {
  mapping: "Mapeo de columnas",
  eventDate: "Fecha del lote",
  review: "Caravanas y confirmación",
};

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

type PesajeMode = "individual" | "tropa";
type TropaSource = "potrero" | "archivo";

export function PesajeForm({
  farms,
  establishments,
}: {
  farms: { id: string; name: string }[];
  establishments: { id: string; name: string }[];
}) {
  const [mode, setMode] = useState<PesajeMode>("individual");
  const [tropaSource, setTropaSource] = useState<TropaSource>("potrero");
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [rows, setRows] = useState<PesajeResolvedRow[]>([]);
  const [step, setStep] = useState<PesajeFormStep | null>(null);

  // File-driven flow, shared by "individual" and tropa's "archivo" source:
  // Excel with tag (+ weight, for individual only).
  const [farmId, setFarmId] = useState(farms.length === 1 ? farms[0].id : "");
  const [file, setFile] = useState<File | null>(null);
  const [eventDate, setEventDate] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [stepHistory, setStepHistory] = useState<PesajeFormStep[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [workingMapping, setWorkingMapping] = useState<ColumnMapping[] | null>(null);

  // Tropa's "potrero" source: whole potrero, no file.
  const [establishmentId, setEstablishmentId] = useState(establishments.length === 1 ? establishments[0].id : "");
  const [paddockId, setPaddockId] = useState<string | null>(null);
  const [paddocks, setPaddocks] = useState<PaddockCatalogEntry[]>([]);
  const [paddockLoadError, setPaddockLoadError] = useState("");
  const [tropaEventDate, setTropaEventDate] = useState(todayISODate());
  const [tropaFarmId, setTropaFarmId] = useState("");
  const [isLoadingTropa, setIsLoadingTropa] = useState(false);

  // Tropa (either source): one total weight, split evenly across the batch.
  const [totalWeightKg, setTotalWeightKg] = useState("");

  const isFileFlow = mode === "individual" || (mode === "tropa" && tropaSource === "archivo");
  const isPotreroFlow = mode === "tropa" && tropaSource === "potrero";

  function resetToStart() {
    setRows([]);
    setStep(null);
  }

  function handleModeChange(selectedMode: PesajeMode) {
    setMode(selectedMode);
    setTropaSource("potrero");
    setTotalWeightKg("");
    resetToStart();
    handleFileChange(null);
  }

  function handleTropaSourceChange(selectedSource: TropaSource) {
    setTropaSource(selectedSource);
    resetToStart();
    handleFileChange(null);
  }

  function handleFarmChange(selectedFarmId: string) {
    setFarmId(selectedFarmId);
    handleFileChange(null);
  }

  function handleFileChange(selected: File | null) {
    setFile(selected);
    setEventDate("");
    setPreview(null);
    setRows([]);
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
      formData.set("requireWeight", mode === "tropa" ? "false" : "true");
      if (mapping) formData.set("mapping", JSON.stringify(mapping));
      const result = await previewPesajeBatch(formData);
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

  async function handleEstablishmentChange(selectedEstablishmentId: string) {
    setEstablishmentId(selectedEstablishmentId);
    setPaddockId(null);
    setPaddockLoadError("");
    resetToStart();
    if (!selectedEstablishmentId) {
      setPaddocks([]);
      return;
    }
    try {
      setPaddocks(await listPesajePaddocksAction(selectedEstablishmentId));
    } catch (err) {
      setPaddocks([]);
      setPaddockLoadError(err instanceof Error ? err.message : "No se pudieron cargar los potreros");
    }
  }

  function handlePaddockChange(selectedPaddockId: string | null) {
    setPaddockId(selectedPaddockId);
    resetToStart();
  }

  async function handleCreatePaddock(name: string): Promise<PaddockCatalogEntry> {
    const created = await createPesajePaddockAction(establishmentId, name);
    setPaddocks((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
  }

  async function handleLoadTropa() {
    if (!establishmentId || !paddockId || !tropaEventDate) return;
    setIsLoadingTropa(true);
    try {
      const result = await previewPesajeTropaBatch({ establishmentId, paddockId, eventDate: tropaEventDate });
      setTropaFarmId(result.farmId);
      setRows(result.rows);
      setStep("review");
    } catch (err) {
      toast({ type: "error", title: err instanceof Error ? err.message : "Ocurrió un error" });
    } finally {
      setIsLoadingTropa(false);
    }
  }

  async function doConfirm() {
    if (step !== "review") return;
    if (isFileFlow && !workingMapping) return;
    setIsSubmitting(true);
    try {
      await confirmPesajeBatchAction({
        mapping: isFileFlow ? (workingMapping ?? undefined) : undefined,
        farmId: isFileFlow ? farmId : tropaFarmId,
        rows,
        totalWeightKg: mode === "tropa" ? totalWeightKg : null,
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
    if (step !== "review") return;
    setConfirmDialogOpen(true);
  }

  if (confirmed) {
    return <p>Lote confirmado.</p>;
  }

  const confirmableRowCount = rows.filter((r) => r.status === "existing").length;
  const hasConfirmableRow = confirmableRowCount > 0;
  const parsedTotalWeightKg = Number(totalWeightKg.replace(",", "."));
  const totalWeightValid = totalWeightKg.trim() !== "" && parsedTotalWeightKg > 0;
  const estimatedAverageKg =
    mode === "tropa" && totalWeightValid && confirmableRowCount > 0
      ? (parsedTotalWeightKg / confirmableRowCount).toFixed(1)
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="mode">Modalidad</Label>
        <select
          id="mode"
          aria-label="Modalidad"
          value={mode}
          onChange={(e) => handleModeChange(e.target.value as PesajeMode)}
          className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
        >
          <option value="individual">Individual</option>
          <option value="tropa">Tropa</option>
        </select>
      </div>

      {mode === "tropa" && !step ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="tropaSource">Origen de las caravanas</Label>
          <select
            id="tropaSource"
            aria-label="Origen de las caravanas"
            value={tropaSource}
            onChange={(e) => handleTropaSourceChange(e.target.value as TropaSource)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
          >
            <option value="potrero">Potrero</option>
            <option value="archivo">Archivo</option>
          </select>
        </div>
      ) : null}

      {isFileFlow && !step ? (
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

          <div className="flex flex-col gap-2">
            <Label htmlFor="file">Archivo</Label>
            <FileInput id="file" disabled={!farmId} file={file} onChange={handleFileChange} />
          </div>
          <Button type="button" disabled={!farmId || !file} onClick={() => runPreview()}>
            Subir
          </Button>
        </>
      ) : null}

      {isFileFlow && step === "mapping" ? (
        <div className="flex flex-col gap-2">
          <StepHeading label={STEP_LABELS.mapping} position={stepHistory.length + 1} />
          <ColumnMapper
            headers={headers}
            availableMeanings={mode === "tropa" ? ["tag", "date", "notes", "ignore"] : ["tag", "date", "weight", "notes", "ignore"]}
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

      {isFileFlow && step === "eventDate" ? (
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

      {isPotreroFlow && !step ? (
        <>
          {establishments.length > 1 ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="establishment">Campo</Label>
              <select
                id="establishment"
                aria-label="Campo"
                value={establishmentId}
                onChange={(e) => handleEstablishmentChange(e.target.value)}
                className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
              >
                <option value="">Elegir campo</option>
                {establishments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {paddockLoadError ? <p className="text-sm text-destructive">{paddockLoadError}</p> : null}
          {establishmentId ? (
            <PaddockSelector
              paddocks={paddocks}
              paddockId={paddockId}
              onChange={handlePaddockChange}
              onCreatePaddock={handleCreatePaddock}
              label="Potrero"
              allowNone={false}
            />
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="tropaEventDate">Fecha</Label>
            <Input
              id="tropaEventDate"
              type="date"
              value={tropaEventDate}
              onChange={(e) => setTropaEventDate(e.target.value)}
            />
          </div>
          <Button
            type="button"
            disabled={!establishmentId || !paddockId || !tropaEventDate || isLoadingTropa}
            onClick={handleLoadTropa}
          >
            Cargar
          </Button>
        </>
      ) : null}

      {step === "review" ? (
        <div className="flex flex-col gap-4">
          <StepHeading label={STEP_LABELS.review} position={isFileFlow ? stepHistory.length + 1 : 1} />
          {mode === "tropa" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="totalWeightKg">Peso total (kg)</Label>
              <Input
                id="totalWeightKg"
                type="text"
                inputMode="decimal"
                value={totalWeightKg}
                onChange={(e) => setTotalWeightKg(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                {estimatedAverageKg
                  ? `≈ ${estimatedAverageKg} kg por animal (${confirmableRowCount} cabezas), estimado.`
                  : `Ingresá el peso total para ${confirmableRowCount} cabezas.`}
              </p>
            </div>
          ) : null}
          <ScrollablePreviewTable>
            <PesajePreviewTable rows={rows} />
          </ScrollablePreviewTable>
          <div className="flex gap-2">
            {isFileFlow && stepHistory.length > 0 ? (
              <Button type="button" variant="outline" onClick={handleBack}>
                Atrás
              </Button>
            ) : null}
            {isPotreroFlow ? (
              <Button type="button" variant="outline" onClick={resetToStart}>
                Atrás
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={
                isSubmitting ||
                rows.some((r) => r.status === "error") ||
                !hasConfirmableRow ||
                (mode === "tropa" && !totalWeightValid)
              }
              onClick={handleConfirm}
            >
              Confirmar
            </Button>
          </div>
          <ConfirmDialog
            open={confirmDialogOpen}
            onOpenChange={setConfirmDialogOpen}
            title="¿Confirmar pesaje?"
            description="Se va a registrar este lote de pesaje. Esta acción no se puede deshacer."
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
