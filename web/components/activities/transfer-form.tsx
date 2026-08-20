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
import { TransferPreviewTable } from "@/components/activities/transfer-preview-table";
import { ScrollablePreviewTable } from "@/components/activities/scrollable-preview-table";
import { PendingOwnerEditor } from "@/components/activities/pending-owner-editor";
import { PaddockSelector } from "@/components/activities/paddock-selector";
import { GuideForm } from "@/components/activities/guide-form";
import {
  previewTransferBatch,
  confirmTransferBatchAction,
  createOwnerAction,
  listPaddocksAction,
  createPaddockAction,
  type PreviewResult,
} from "@/app/(protected)/activities/transfer/actions";
import type { ColumnMapping } from "@/lib/activities/column-mapping";
import type { ResolvedRow } from "@/lib/activities/transfer";
import type { OwnerCatalogEntry } from "@/lib/dal/owner-catalog";
import type { PaddockCatalogEntry } from "@/lib/dal/paddock-catalog";

// Local, dependency-free re-implementation rather than importing the runtime
// export from "@/lib/activities/transfer": that module also pulls in the
// server-only `db` client (pg), and a "use client" component importing a
// *value* from it (not just the type) drags pg into the browser bundle,
// which breaks (pg needs node builtins like "net"/"tls"/"dns"). Same pattern
// as components/activities/health-form.tsx.
function pendingOwnerNames(rows: ResolvedRow[]): string[] {
  const names: string[] = [];
  for (const row of rows) {
    if (row.status === "new" && row.pendingOwnerName) names.push(row.pendingOwnerName);
    if (row.status === "foreign" && row.forced && row.pendingOwnerName) names.push(row.pendingOwnerName);
  }
  return Array.from(new Set(names));
}

type TransferFormStep = "mapping" | "eventDate" | "review";

function stepFromPreview(result: PreviewResult): TransferFormStep {
  if (result.mappingNeeded) return "mapping";
  if (result.eventDateNeeded) return "eventDate";
  return "review";
}

const STEP_LABELS: Record<TransferFormStep, string> = {
  mapping: "Mapeo de columnas",
  eventDate: "Fecha del lote",
  review: "Caravanas y confirmación",
};

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TransferForm({ establishments }: { establishments: { id: string; name: string }[] }) {
  const [destinationEstablishmentId, setDestinationEstablishmentId] = useState("");
  const [paddocks, setPaddocks] = useState<PaddockCatalogEntry[]>([]);
  const [destinationPaddockId, setDestinationPaddockId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [eventDate, setEventDate] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [rows, setRows] = useState<ResolvedRow[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [mode, setMode] = useState<"excel" | "pdf">("excel");
  const [paddockLoadError, setPaddockLoadError] = useState("");
  const [step, setStep] = useState<TransferFormStep | null>(null);
  const [stepHistory, setStepHistory] = useState<TransferFormStep[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [workingMapping, setWorkingMapping] = useState<ColumnMapping[] | null>(null);

  async function handleDestinationEstablishmentChange(establishmentId: string) {
    setDestinationEstablishmentId(establishmentId);
    setDestinationPaddockId(null);
    setEventDate("");
    setPreview(null);
    setRows([]);
    setPaddockLoadError("");
    setStep(null);
    setStepHistory([]);
    setHeaders([]);
    setWorkingMapping(null);
    if (!establishmentId) {
      setPaddocks([]);
      return;
    }
    try {
      setPaddocks(await listPaddocksAction(establishmentId));
    } catch (err) {
      setPaddocks([]);
      setPaddockLoadError(err instanceof Error ? err.message : "No se pudieron cargar los potreros");
    }
  }

  function handleFileChange(selected: File | null) {
    setFile(selected);
    setEventDate("");
  }

  async function runPreview(mapping?: ColumnMapping[]) {
    if (!file || !destinationEstablishmentId) return;
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("eventDate", eventDate);
      formData.set("establishmentId", destinationEstablishmentId);
      if (mapping) formData.set("mapping", JSON.stringify(mapping));
      const result = await previewTransferBatch(formData);
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

  async function handleCreatePaddock(name: string): Promise<PaddockCatalogEntry> {
    const created = await createPaddockAction(destinationEstablishmentId, name);
    setPaddocks((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
  }

  async function handleCreateOwner(name: string): Promise<OwnerCatalogEntry> {
    return createOwnerAction(destinationEstablishmentId, name);
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

  async function doConfirm() {
    if (step !== "review" || !workingMapping) return;
    setIsSubmitting(true);
    try {
      await confirmTransferBatchAction({
        mapping: workingMapping,
        destinationEstablishmentId,
        destinationPaddockId,
        rows,
      });
      setConfirmed(true);
      toast({ type: "success", title: "Traslado confirmado." });
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

  const pendingNames = pendingOwnerNames(rows);
  const hasConfirmableRow = rows.some(
    (r) =>
      r.status === "new" || r.status === "existing" || r.status === "wrong_establishment" || (r.status === "foreign" && r.forced)
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Button type="button" variant={mode === "excel" ? "default" : "outline"} onClick={() => setMode("excel")}>
          Excel
        </Button>
        <Button type="button" variant={mode === "pdf" ? "default" : "outline"} onClick={() => setMode("pdf")}>
          Guía SNIG (PDF)
        </Button>
      </div>
      {mode === "pdf" ? (
        <GuideForm />
      ) : (
        <div className="flex flex-col gap-4">
          {!step ? (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="destinationEstablishment">Campo destino</Label>
                <select
                  id="destinationEstablishment"
                  aria-label="Campo destino"
                  value={destinationEstablishmentId}
                  onChange={(e) => handleDestinationEstablishmentChange(e.target.value)}
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
              {paddockLoadError ? <p className="text-sm text-red-600">{paddockLoadError}</p> : null}
              {destinationEstablishmentId ? (
                <PaddockSelector
                  paddocks={paddocks}
                  paddockId={destinationPaddockId}
                  onChange={setDestinationPaddockId}
                  onCreatePaddock={handleCreatePaddock}
                />
              ) : null}
              <div className="flex flex-col gap-2">
                <Label htmlFor="file">Archivo</Label>
                <FileInput id="file" file={file} onChange={handleFileChange} />
              </div>
              <Button type="button" disabled={!destinationEstablishmentId || !file} onClick={() => runPreview()}>
                Subir
              </Button>
            </>
          ) : null}

          {step === "mapping" ? (
            <div className="flex flex-col gap-2">
              <StepHeading label={STEP_LABELS.mapping} position={stepHistory.length + 1} />
              <ColumnMapper
                headers={headers}
                availableMeanings={["tag", "date", "category", "sex", "owner", "notes", "secondaryTag", "breed", "ignore"]}
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
              <PendingOwnerEditor pendingNames={pendingNames} onCreateOwner={handleCreateOwner} onResolved={handleOwnerResolved} />
              <ScrollablePreviewTable>
                <TransferPreviewTable rows={rows} onToggleForced={handleToggleForced} />
              </ScrollablePreviewTable>
              <div className="flex gap-2">
                {stepHistory.length > 0 ? (
                  <Button type="button" variant="outline" onClick={handleBack}>
                    Atrás
                  </Button>
                ) : null}
                <Button
                  type="button"
                  disabled={isSubmitting || rows.some((r) => r.status === "error") || pendingNames.length > 0 || !hasConfirmableRow}
                  onClick={handleConfirm}
                >
                  Confirmar
                </Button>
              </div>
              <ConfirmDialog
                open={confirmDialogOpen}
                onOpenChange={setConfirmDialogOpen}
                title="¿Confirmar traslado?"
                description="Se va a registrar el traslado de estas caravanas. Esta acción no se puede deshacer."
                confirmLabel="Confirmar"
                cancelLabel="Cancelar"
                variant="destructive"
                onConfirm={doConfirm}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
