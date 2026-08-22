"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileInput } from "@/components/ui/file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { ColumnMapper } from "@/components/activities/column-mapper";
import { WizardProgress } from "@/components/activities/wizard-progress";
import { TransferPreviewTable } from "@/components/activities/transfer-preview-table";
import { ScrollablePreviewTable } from "@/components/activities/scrollable-preview-table";
import { ProductListEditor, emptyProduct } from "@/components/activities/product-list-editor";
import { PendingOwnerEditor } from "@/components/activities/pending-owner-editor";
import { PaddockSelector } from "@/components/activities/paddock-selector";
import { PaddockMismatchWarning } from "@/components/activities/paddock-mismatch-warning";
import { ReproductiveStatusLegend } from "@/components/activities/reproductive-status-legend";
import { parseActivityFileAction } from "@/app/(protected)/activities/shared-actions";
import {
  previewHealthBatch,
  confirmHealthBatchAction,
  createProductAction,
  createOwnerAction,
  createHealthPaddockAction,
  listPaddocksAction,
  listTagsInPaddockAction,
  listProductsAction,
  resolveReproductiveStatusNamesAction,
  type PreviewResult,
} from "@/app/(protected)/activities/health/actions";
import { extractDistinctColumnValues, type ColumnMapping } from "@/lib/activities/column-mapping";
import type { HealthProduct } from "@/lib/activities/health";
import { findPaddockMismatches, findMissingFromPaddock } from "@/lib/activities/health-paddock-mismatch";
import { HealthFormSidebar } from "@/components/activities/health-form-sidebar";
import { PaddockMissingList } from "@/components/activities/paddock-missing-list";
import { saveHealthFormDraft, loadHealthFormDraft, clearHealthFormDraft, type HealthFormStep } from "@/lib/activities/health-form-draft";
import type { ResolvedRow } from "@/lib/activities/batch-resolution";
import type { ProductCatalogEntry } from "@/lib/dal/product-catalog";
import type { OwnerCatalogEntry } from "@/lib/dal/owner-catalog";
import type { PaddockCatalogEntry } from "@/lib/dal/paddock-catalog";

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

// Mapping and the reproductive-status legend are both resolved client-side
// before the first previewHealthBatch call, so in practice only the
// eventDate/rows branches are ever taken — the rest is defensive.
function stepFromPreview(result: PreviewResult): HealthFormStep {
  if (result.mappingNeeded) return "mapping";
  if (result.valueLegendNeeded) return "reproductiveStatus";
  if (result.eventDateNeeded) return "eventDate";
  return "products";
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
  const [rows, setRows] = useState<ResolvedRow[]>([]);
  const [catalog, setCatalog] = useState<ProductCatalogEntry[]>([]);
  const [catalogLoadError, setCatalogLoadError] = useState("");
  const [ownerCatalog, setOwnerCatalog] = useState<OwnerCatalogEntry[]>(initialOwnerCatalog);
  const [products, setProducts] = useState<HealthProduct[]>([emptyProduct()]);
  const [suggestedNames, setSuggestedNames] = useState<(string | null)[]>([null]);
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [transferMismatched, setTransferMismatched] = useState<boolean | null>(null);
  const [paddockTags, setPaddockTags] = useState<string[]>([]);
  const [step, setStep] = useState<HealthFormStep | null>(null);
  const [stepHistory, setStepHistory] = useState<HealthFormStep[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [workingMapping, setWorkingMapping] = useState<ColumnMapping[] | null>(null);
  const [reproductiveStatusNameMap, setReproductiveStatusNameMap] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);

  // Restore a draft saved before a reload. The raw File can't come back
  // (browsers don't let a page get that back), but every later step works off
  // the already-parsed headers/rawRows, so the wizard resumes where it was.
  useEffect(() => {
    const draft = loadHealthFormDraft();
    if (draft) {
      setEstablishmentId(draft.establishmentId);
      setPaddockId(draft.paddockId);
      setEventDate(draft.eventDate);
      setStep(draft.step);
      setStepHistory(draft.stepHistory);
      setHeaders(draft.headers);
      setRawRows(draft.rawRows);
      setWorkingMapping(draft.workingMapping);
      setReproductiveStatusNameMap(draft.reproductiveStatusNameMap);
      setRows(draft.rows);
      setProducts(draft.products);
      setSuggestedNames(draft.suggestedNames);
      setTransferMismatched(draft.transferMismatched);
      if (draft.establishmentId) {
        listPaddocksAction(draft.establishmentId).then(setPaddocks).catch(() => {});
        listProductsAction(draft.establishmentId).then(setCatalog).catch(() => {});
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
      rawRows,
      workingMapping,
      reproductiveStatusNameMap,
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
    rawRows,
    workingMapping,
    reproductiveStatusNameMap,
    rows,
    products,
    suggestedNames,
    transferMismatched,
  ]);

  async function handleEstablishmentChange(selectedEstablishmentId: string) {
    setEstablishmentId(selectedEstablishmentId);
    setPaddockId(null);
    setEventDate("");
    setRows([]);
    setTransferMismatched(null);
    setPaddockLoadError("");
    setCatalogLoadError("");
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
  }

  function handleDiscardDraft() {
    clearHealthFormDraft();
    setEstablishmentId("");
    setPaddockId(null);
    setPaddocks([]);
    setFile(null);
    setEventDate("");
    setRows([]);
    setCatalog([]);
    setProducts([emptyProduct()]);
    setSuggestedNames([null]);
    setTransferMismatched(null);
    setPaddockTags([]);
    setReproductiveStatusNameMap({});
    setStep(null);
    setStepHistory([]);
    setHeaders([]);
    setRawRows([]);
    setWorkingMapping(null);
  }

  async function handlePaddockChange(selectedPaddockId: string | null) {
    setPaddockId(selectedPaddockId);
    setEventDate("");
    setRows([]);
    setTransferMismatched(null);
    setPaddockTags([]);
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
  }

  async function handleUploadFile() {
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    const result = await parseActivityFileAction(formData);
    setHeaders(result.headers);
    setRawRows(result.rows);
    setWorkingMapping(result.initialMapping);
    setStep("mapping");
    setStepHistory([]);
  }

  function handleMappingSubmit(mapping: ColumnMapping[]) {
    setWorkingMapping(mapping);
    setStepHistory((prev) => [...prev, "mapping"]);
    const distinctValues = extractDistinctColumnValues(headers, rawRows, mapping, "reproductiveStatus");
    setStep(distinctValues.length > 0 ? "reproductiveStatus" : "establishment");
  }

  function handleReproductiveStatusLegendChange(nameMap: Record<string, string>) {
    setReproductiveStatusNameMap(nameMap);
  }

  function handleSubmitReproductiveStatusLegend() {
    if (step !== "reproductiveStatus") return;
    setStepHistory((prev) => [...prev, "reproductiveStatus"]);
    setStep("establishment");
  }

  async function handleSubmitEstablishmentStep() {
    if (step !== "establishment" || !workingMapping || !establishmentId || !paddockId) return;
    let mapping = workingMapping;
    // Only the values still present in the file matter — a mapping edited via
    // "Atrás" can leave stale entries behind in the name map.
    const nameMap: Record<string, string> = {};
    for (const value of extractDistinctColumnValues(headers, rawRows, mapping, "reproductiveStatus")) {
      const name = reproductiveStatusNameMap[value];
      if (name) nameMap[value] = name;
    }
    if (Object.keys(nameMap).length > 0) {
      const resolvedIds = await resolveReproductiveStatusNamesAction(establishmentId, nameMap);
      mapping = mapping.map((m) =>
        m.meaning === "reproductiveStatus" ? { ...m, reproductiveStatusValueMap: resolvedIds } : m
      );
      setWorkingMapping(mapping);
    }
    setStepHistory((prev) => [...prev, "establishment"]);
    await runPreview(mapping);
  }

  async function runPreview(mapping: ColumnMapping[]) {
    if (!file || !establishmentId) return;
    const formData = new FormData();
    formData.set("file", file);
    formData.set("eventDate", eventDate);
    formData.set("establishmentId", establishmentId);
    formData.set("mapping", JSON.stringify(mapping));
    const result = await previewHealthBatch(formData);
    if (result.mappingNeeded || result.valueLegendNeeded) {
      // Defensive only — the client always sends a fully-resolved mapping by
      // this point, so neither branch is reachable in normal operation.
      return;
    }
    setStep(stepFromPreview(result));
    if (result.eventDateNeeded) return;
    setRows(result.rows);
    const built = buildInitialProducts(result.productSuggestions, catalog);
    setProducts(built.products);
    setSuggestedNames(built.suggestedNames);
  }

  function handleBack() {
    if (stepHistory.length === 0) {
      setStep(null);
      return;
    }
    setStep(stepHistory[stepHistory.length - 1]);
    setStepHistory(stepHistory.slice(0, -1));
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


  async function doConfirm() {
    if (step !== "review" || !workingMapping) return;
    setIsSubmitting(true);
    try {
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

  const reproductiveStatusValues = extractDistinctColumnValues(
    headers,
    rawRows,
    workingMapping ?? [],
    "reproductiveStatus"
  );
  const wizardSteps = [
    { key: "mapping", label: "Mapeo de columnas" },
    ...(reproductiveStatusValues.length > 0 ? [{ key: "reproductiveStatus", label: "Estado reproductivo" }] : []),
    { key: "establishment", label: "Campo y potrero" },
    ...(step === "eventDate" || stepHistory.includes("eventDate") ? [{ key: "eventDate", label: "Fecha del lote" }] : []),
    { key: "products", label: "Productos" },
    { key: "review", label: "Caravanas y confirmación" },
  ];

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <Card className="min-w-0 flex-1">
        <CardHeader>
          <CardTitle>Sanidad</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
      {step ? <WizardProgress steps={wizardSteps} currentIndex={wizardSteps.findIndex((s) => s.key === step)} /> : null}

      {!step ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="file">Archivo</Label>
          <FileInput id="file" file={file} onChange={handleFileChange} />
          <Button type="button" disabled={!file} onClick={handleUploadFile}>
            Subir
          </Button>
        </div>
      ) : null}

      {step === "mapping" ? (
        <div className="flex flex-col gap-2">
          <ColumnMapper
            headers={headers}
            availableMeanings={[
              "tag",
              "secondaryTag",
              "date",
              "notes",
              "product",
              "category",
              "sex",
              "breed",
              "owner",
              "reproductiveStatus",
              "ignore",
            ]}
            initialMapping={workingMapping}
            onSubmit={handleMappingSubmit}
          />
          <Button type="button" variant="outline" onClick={handleBack}>
            Atrás
          </Button>
        </div>
      ) : null}

      {step === "reproductiveStatus" ? (
        <div className="flex flex-col gap-2">
          <ReproductiveStatusLegend
            distinctValues={reproductiveStatusValues}
            initialNameMap={reproductiveStatusNameMap}
            onChange={handleReproductiveStatusLegendChange}
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={handleBack}>
              Atrás
            </Button>
            <Button type="button" onClick={handleSubmitReproductiveStatusLegend}>
              Continuar
            </Button>
          </div>
        </div>
      ) : null}

      {step === "establishment" ? (
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
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={handleBack}>
              Atrás
            </Button>
            <Button type="button" disabled={!establishmentId || !paddockId} onClick={handleSubmitEstablishmentStep}>
              Continuar
            </Button>
          </div>
        </div>
      ) : null}

      {step === "eventDate" ? (
        <div className="flex flex-col gap-2">
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
                isSubmitting ||
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
          <ConfirmDialog
            open={confirmDialogOpen}
            onOpenChange={setConfirmDialogOpen}
            title="¿Confirmar sanidad?"
            description="Se va a registrar este lote de sanidad."
            confirmLabel="Confirmar"
            cancelLabel="Cancelar"
            variant="destructive"
            onConfirm={doConfirm}
          />
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
