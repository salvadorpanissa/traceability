"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileInput } from "@/components/ui/file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColumnMapper } from "@/components/activities/column-mapper";
import { TransferPreviewTable } from "@/components/activities/transfer-preview-table";
import { ScrollablePreviewTable } from "@/components/activities/scrollable-preview-table";
import { ProductListEditor, emptyProduct } from "@/components/activities/product-list-editor";
import { PendingOwnerEditor } from "@/components/activities/pending-owner-editor";
import { PaddockSelector } from "@/components/activities/paddock-selector";
import { PaddockMismatchWarning } from "@/components/activities/paddock-mismatch-warning";
import { ReproductiveStatusLegend } from "@/components/activities/reproductive-status-legend";
import {
  previewHealthBatch,
  confirmHealthBatchAction,
  createProductAction,
  createOwnerAction,
  createHealthPaddockAction,
  listPaddocksAction,
  listTagsInPaddockAction,
  listProductsAction,
  createReproductiveStatusForHealthAction,
  listReproductiveStatusesAction,
  type PreviewResult,
} from "@/app/(protected)/activities/health/actions";
import type { ColumnMapping } from "@/lib/activities/column-mapping";
import type { HealthProduct } from "@/lib/activities/health";
import { findPaddockMismatches, findMissingFromPaddock } from "@/lib/activities/health-paddock-mismatch";
import { HealthFormSidebar } from "@/components/activities/health-form-sidebar";
import { PaddockMissingList } from "@/components/activities/paddock-missing-list";
import { saveHealthFormDraft, loadHealthFormDraft, clearHealthFormDraft, type HealthFormStep } from "@/lib/activities/health-form-draft";
import type { ResolvedRow } from "@/lib/activities/batch-resolution";
import type { ProductCatalogEntry } from "@/lib/dal/product-catalog";
import type { OwnerCatalogEntry } from "@/lib/dal/owner-catalog";
import type { PaddockCatalogEntry } from "@/lib/dal/paddock-catalog";
import type { ReproductiveStatusCatalogEntry } from "@/lib/dal/reproductive-status-catalog";

function buildInitialProducts(
  suggestions: { rawValue: string; matchedProductId: string | null }[],
  catalog: ProductCatalogEntry[]
): { products: HealthProduct[]; suggestedNames: (string | null)[] } {
  if (suggestions.length === 0) {
    return { products: [emptyProduct()], suggestedNames: [null] };
  }
  const products = suggestions.map((s) => {
    const matched = s.matchedProductId ? catalog.find((c) => c.id === s.matchedProductId) : undefined;
    return {
      productId: s.matchedProductId ?? "",
      dose: matched?.defaultDose ?? "",
      doseUnit: matched?.defaultDoseUnit ?? "",
      route: matched?.defaultRoute ?? "",
      withdrawalDays: matched?.defaultWithdrawalDays ?? null,
      notes: null,
    };
  });
  const suggestedNames = suggestions.map((s) => (s.matchedProductId ? null : s.rawValue));
  return { products, suggestedNames };
}

function stepFromPreview(result: PreviewResult): HealthFormStep {
  if (result.mappingNeeded) return "mapping";
  if (result.valueLegendNeeded) return "legend";
  if (result.eventDateNeeded) return "eventDate";
  return "products";
}

const STEP_LABELS: Record<HealthFormStep, string> = {
  mapping: "Mapeo de columnas",
  legend: "Estados reproductivos",
  eventDate: "Fecha del lote",
  products: "Productos",
  review: "Caravanas y confirmación",
};

function StepHeading({ step, position }: { step: HealthFormStep; position: number }) {
  return (
    <p className="border-t border-border pt-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      Paso {position} · {STEP_LABELS[step]}
    </p>
  );
}

function pendingOwnerNames(rows: ResolvedRow[]): string[] {
  const names: string[] = [];
  for (const row of rows) {
    if (row.status === "new" && row.pendingOwnerName) names.push(row.pendingOwnerName);
    if (row.status === "foreign" && row.forced && row.pendingOwnerName) names.push(row.pendingOwnerName);
  }
  return Array.from(new Set(names));
}

export function HealthForm({
  ownerCatalog: initialOwnerCatalog,
  establishments,
}: {
  ownerCatalog: OwnerCatalogEntry[];
  establishments: { id: string; name: string }[];
}) {
  const [establishmentId, setEstablishmentId] = useState("");
  const [paddockId, setPaddockId] = useState<string | null>(null);
  const [paddocks, setPaddocks] = useState<PaddockCatalogEntry[]>([]);
  const [paddockLoadError, setPaddockLoadError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [eventDate, setEventDate] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [rows, setRows] = useState<ResolvedRow[]>([]);
  const [catalog, setCatalog] = useState<ProductCatalogEntry[]>([]);
  const [catalogLoadError, setCatalogLoadError] = useState("");
  const [ownerCatalog, setOwnerCatalog] = useState<OwnerCatalogEntry[]>(initialOwnerCatalog);
  const [products, setProducts] = useState<HealthProduct[]>([emptyProduct()]);
  const [suggestedNames, setSuggestedNames] = useState<(string | null)[]>([null]);
  const [confirmed, setConfirmed] = useState(false);
  const [transferMismatched, setTransferMismatched] = useState<boolean | null>(null);
  const [paddockTags, setPaddockTags] = useState<string[]>([]);
  const [reproductiveStatusCatalog, setReproductiveStatusCatalog] = useState<ReproductiveStatusCatalogEntry[]>([]);
  const [reproductiveStatusValueMap, setReproductiveStatusValueMap] = useState<Record<string, string>>({});
  const [step, setStep] = useState<HealthFormStep | null>(null);
  const [stepHistory, setStepHistory] = useState<HealthFormStep[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [workingMapping, setWorkingMapping] = useState<ColumnMapping[] | null>(null);
  const [distinctValues, setDistinctValues] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  // True only for the one file-pick right after a draft is restored — lets
  // handleFileChange auto-continue with the cached mapping instead of
  // treating it like an unrelated new file (which must reset the legend).
  const [resumingFromDraft, setResumingFromDraft] = useState(false);

  // Restore a draft saved before a reload — everything except the raw File
  // (browsers don't let a page get that back), so mapping/legend/eventDate
  // steps ask the user to re-pick the same file to continue.
  useEffect(() => {
    const draft = loadHealthFormDraft();
    if (draft) {
      setEstablishmentId(draft.establishmentId);
      setPaddockId(draft.paddockId);
      setEventDate(draft.eventDate);
      setStep(draft.step);
      setStepHistory(draft.stepHistory);
      setHeaders(draft.headers);
      setWorkingMapping(draft.workingMapping);
      setDistinctValues(draft.distinctValues);
      setReproductiveStatusValueMap(draft.reproductiveStatusValueMap);
      setRows(draft.rows);
      setProducts(draft.products);
      setSuggestedNames(draft.suggestedNames);
      setTransferMismatched(draft.transferMismatched);
      setResumingFromDraft(draft.step === "mapping" || draft.step === "legend" || draft.step === "eventDate");
      if (draft.establishmentId) {
        listPaddocksAction(draft.establishmentId).then(setPaddocks).catch(() => {});
        listProductsAction(draft.establishmentId).then(setCatalog).catch(() => {});
        listReproductiveStatusesAction(draft.establishmentId).then(setReproductiveStatusCatalog).catch(() => {});
      }
      if (draft.establishmentId && draft.paddockId) {
        listTagsInPaddockAction(draft.establishmentId, draft.paddockId).then(setPaddockTags).catch(() => {});
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || confirmed) return;
    saveHealthFormDraft({
      establishmentId,
      paddockId,
      eventDate,
      step,
      stepHistory,
      headers,
      workingMapping,
      distinctValues,
      reproductiveStatusValueMap,
      rows,
      products,
      suggestedNames,
      transferMismatched,
    });
  }, [
    hydrated,
    confirmed,
    establishmentId,
    paddockId,
    eventDate,
    step,
    stepHistory,
    headers,
    workingMapping,
    distinctValues,
    reproductiveStatusValueMap,
    rows,
    products,
    suggestedNames,
    transferMismatched,
  ]);

  async function handleEstablishmentChange(selectedEstablishmentId: string) {
    setEstablishmentId(selectedEstablishmentId);
    setPaddockId(null);
    setEventDate("");
    setPreview(null);
    setRows([]);
    setTransferMismatched(null);
    setPaddockLoadError("");
    setCatalogLoadError("");
    setReproductiveStatusValueMap({});
    setStep(null);
    setStepHistory([]);
    setHeaders([]);
    setWorkingMapping(null);
    setDistinctValues([]);
    setResumingFromDraft(false);
    if (!selectedEstablishmentId) {
      setPaddocks([]);
      setCatalog([]);
      return;
    }
    try {
      setPaddocks(await listPaddocksAction(selectedEstablishmentId));
    } catch (err) {
      setPaddocks([]);
      setPaddockLoadError(err instanceof Error ? err.message : "No se pudieron cargar los potreros");
    }
    try {
      setCatalog(await listProductsAction(selectedEstablishmentId));
    } catch (err) {
      setCatalog([]);
      setCatalogLoadError(err instanceof Error ? err.message : "No se pudieron cargar los productos");
    }
    try {
      setReproductiveStatusCatalog(await listReproductiveStatusesAction(selectedEstablishmentId));
    } catch {
      setReproductiveStatusCatalog([]);
    }
  }

  function handleDiscardDraft() {
    clearHealthFormDraft();
    setEstablishmentId("");
    setPaddockId(null);
    setPaddocks([]);
    setFile(null);
    setEventDate("");
    setPreview(null);
    setRows([]);
    setCatalog([]);
    setProducts([emptyProduct()]);
    setSuggestedNames([null]);
    setTransferMismatched(null);
    setPaddockTags([]);
    setReproductiveStatusValueMap({});
    setStep(null);
    setStepHistory([]);
    setHeaders([]);
    setWorkingMapping(null);
    setDistinctValues([]);
    setResumingFromDraft(false);
  }

  async function handlePaddockChange(selectedPaddockId: string | null) {
    setPaddockId(selectedPaddockId);
    setEventDate("");
    setPreview(null);
    setRows([]);
    setTransferMismatched(null);
    setPaddockTags([]);
    setStep(null);
    setStepHistory([]);
    setHeaders([]);
    setWorkingMapping(null);
    setDistinctValues([]);
    setResumingFromDraft(false);
    if (selectedPaddockId && establishmentId) {
      try {
        setPaddockTags(await listTagsInPaddockAction(establishmentId, selectedPaddockId));
      } catch {
        setPaddockTags([]);
      }
    }
  }

  function handleFileChange(selected: File | null) {
    setFile(selected);
    if (resumingFromDraft) {
      setResumingFromDraft(false);
      if (selected && workingMapping) {
        void runPreview(workingMapping, selected);
        return;
      }
    }
    setEventDate("");
    setTransferMismatched(null);
    setReproductiveStatusValueMap({});
  }

  async function runPreview(mapping?: ColumnMapping[], fileOverride?: File) {
    const activeFile = fileOverride ?? file;
    if (!activeFile || !establishmentId) return;
    const formData = new FormData();
    formData.set("file", activeFile);
    formData.set("eventDate", eventDate);
    formData.set("establishmentId", establishmentId);
    if (mapping) formData.set("mapping", JSON.stringify(mapping));
    const result = await previewHealthBatch(formData);
    setStepHistory((prev) => (step ? [...prev, step] : prev));
    setStep(stepFromPreview(result));
    setPreview(result);
    if (result.mappingNeeded) {
      setHeaders(result.headers);
      return;
    }
    setWorkingMapping(result.mapping);
    if (result.valueLegendNeeded) {
      setDistinctValues(result.distinctValues);
      return;
    }
    if (result.eventDateNeeded) return;
    setRows(result.rows);
    const built = buildInitialProducts(result.productSuggestions, catalog);
    setProducts(built.products);
    setSuggestedNames(built.suggestedNames);
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

  function handleContinueToReview() {
    if (step !== "products") return;
    setStepHistory((prev) => [...prev, "products"]);
    setStep("review");
  }

  async function handleCreateReproductiveStatus(name: string): Promise<ReproductiveStatusCatalogEntry> {
    const created = await createReproductiveStatusForHealthAction(establishmentId, name);
    setReproductiveStatusCatalog((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
  }

  function handleReproductiveStatusLegendChange(valueMap: Record<string, string>) {
    setReproductiveStatusValueMap(valueMap);
  }

  async function handleSubmitReproductiveStatusLegend() {
    if (step !== "legend" || !workingMapping) return;
    const mapping = workingMapping.map((m) =>
      m.meaning === "reproductiveStatus" ? { ...m, reproductiveStatusValueMap: reproductiveStatusValueMap } : m
    );
    await runPreview(mapping);
  }

  async function handleCreateProduct(name: string): Promise<ProductCatalogEntry> {
    const created = await createProductAction(establishmentId, name);
    setCatalog((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
  }

  async function handleCreateOwner(name: string): Promise<OwnerCatalogEntry> {
    const created = await createOwnerAction(establishmentId, name);
    setOwnerCatalog((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
  }

  async function handleCreatePaddock(name: string): Promise<PaddockCatalogEntry> {
    const created = await createHealthPaddockAction(establishmentId, name);
    setPaddocks((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
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
    if (step !== "review" || !workingMapping) return;
    await confirmHealthBatchAction({
      mapping: workingMapping,
      products,
      rows,
      paddockId,
      establishmentId,
      transferMismatchedToPaddock: transferMismatched ?? false,
    });
    clearHealthFormDraft();
    setConfirmed(true);
  }

  const mismatches = useMemo(() => findPaddockMismatches(rows, paddockId, establishmentId), [rows, paddockId, establishmentId]);
  const missingFromPaddock = useMemo(() => findMissingFromPaddock(rows, paddockTags), [rows, paddockTags]);
  const paddockNameById = useMemo(() => new Map(paddocks.map((p) => [p.id, p.name])), [paddocks]);

  if (confirmed) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Sanidad</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Lote confirmado.</p>
        </CardContent>
      </Card>
    );
  }

  const hasIncompleteProduct = products.some((p) => !p.productId || !p.dose || !p.doseUnit || !p.route);
  const pendingNames = pendingOwnerNames(rows);
  const hasConfirmableRow = rows.some(
    (r) =>
      r.status === "new" || r.status === "existing" || r.status === "wrong_establishment" || (r.status === "foreign" && r.forced)
  );
  const needsMismatchDecision = mismatches.length > 0 && transferMismatched === null;

  const establishmentName = establishments.find((e) => e.id === establishmentId)?.name ?? null;
  const paddockName = paddocks.find((p) => p.id === paddockId)?.name ?? null;

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <Card className="min-w-0 flex-1">
        <CardHeader>
          <CardTitle>Sanidad</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
      {!step ? (
        <>
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
          {paddockLoadError ? <p className="text-sm text-red-600">{paddockLoadError}</p> : null}
          {catalogLoadError ? <p className="text-sm text-red-600">{catalogLoadError}</p> : null}
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
            <Label htmlFor="file">Archivo</Label>
            <FileInput id="file" file={file} onChange={handleFileChange} />
          </div>
          <Button type="button" disabled={!establishmentId || !paddockId || !file} onClick={() => runPreview()}>
            Subir
          </Button>
        </>
      ) : null}

      {step && step !== "products" && step !== "review" && !file ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            Recuperamos tu progreso — volvé a elegir el mismo archivo para continuar.
          </p>
          <Label htmlFor="file">Archivo</Label>
          <FileInput id="file" file={file} onChange={handleFileChange} />
        </div>
      ) : null}

      {step === "mapping" ? (
        <div className="flex flex-col gap-2">
          <StepHeading step="mapping" position={stepHistory.length + 1} />
          <ColumnMapper
            headers={headers}
            availableMeanings={[
              "tag",
              "date",
              "category",
              "product",
              "sex",
              "owner",
              "notes",
              "secondaryTag",
              "breed",
              "reproductiveStatus",
              "ignore",
            ]}
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

      {step === "legend" ? (
        <div className="flex flex-col gap-2">
          <StepHeading step="legend" position={stepHistory.length + 1} />
          <ReproductiveStatusLegend
            distinctValues={distinctValues}
            catalog={reproductiveStatusCatalog}
            initialValueMap={reproductiveStatusValueMap}
            onCreateStatus={handleCreateReproductiveStatus}
            onChange={handleReproductiveStatusLegendChange}
          />
          <div className="flex gap-2">
            {stepHistory.length > 0 ? (
              <Button type="button" variant="outline" onClick={handleBack}>
                Atrás
              </Button>
            ) : null}
            <Button type="button" onClick={handleSubmitReproductiveStatusLegend}>
              Continuar
            </Button>
          </div>
        </div>
      ) : null}

      {step === "eventDate" ? (
        <div className="flex flex-col gap-2">
          <StepHeading step="eventDate" position={stepHistory.length + 1} />
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

      {step === "products" ? (
        <div className="flex flex-col gap-4">
          <StepHeading step="products" position={stepHistory.length + 1} />
          <ProductListEditor
            catalog={catalog}
            products={products}
            suggestedNames={suggestedNames}
            onChange={setProducts}
            onCreateProduct={handleCreateProduct}
          />
          <div className="flex gap-2">
            {stepHistory.length > 0 ? (
              <Button type="button" variant="outline" onClick={handleBack}>
                Atrás
              </Button>
            ) : null}
            <Button type="button" disabled={hasIncompleteProduct} onClick={handleContinueToReview}>
              Continuar
            </Button>
          </div>
        </div>
      ) : null}

      {step === "review" ? (
        <div className="flex flex-col gap-4">
          <StepHeading step="review" position={stepHistory.length + 1} />
          <PendingOwnerEditor
            pendingNames={pendingNames}
            ownerCatalog={ownerCatalog}
            onCreateOwner={handleCreateOwner}
            onResolved={handleOwnerResolved}
          />
          {mismatches.length > 0 ? (
            <PaddockMismatchWarning
              mismatches={mismatches}
              paddockNameById={paddockNameById}
              decision={transferMismatched}
              onDecide={setTransferMismatched}
            />
          ) : null}
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
              disabled={
                rows.some((r) => r.status === "error") ||
                hasIncompleteProduct ||
                pendingNames.length > 0 ||
                !hasConfirmableRow ||
                needsMismatchDecision
              }
              onClick={handleConfirm}
            >
              Confirmar
            </Button>
          </div>
        </div>
      ) : null}
        </CardContent>
      </Card>
      {step ? (
        <div className="flex w-full flex-col gap-3 md:w-56 md:shrink-0">
          <HealthFormSidebar
            establishmentName={establishmentName}
            paddockName={paddockName}
            products={products}
            catalog={catalog}
          />
          {missingFromPaddock.length > 0 ? <PaddockMissingList tags={missingFromPaddock} /> : null}
          <Button type="button" variant="outline" size="sm" onClick={handleDiscardDraft}>
            Descartar borrador
          </Button>
        </div>
      ) : null}
    </div>
  );
}
