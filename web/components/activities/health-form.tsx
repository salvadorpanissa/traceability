"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColumnMapper } from "@/components/activities/column-mapper";
import { TransferPreviewTable } from "@/components/activities/transfer-preview-table";
import { ProductListEditor, emptyProduct } from "@/components/activities/product-list-editor";
import { PendingOwnerEditor } from "@/components/activities/pending-owner-editor";
import { PaddockSelector } from "@/components/activities/paddock-selector";
import {
  previewHealthBatch,
  confirmHealthBatchAction,
  createProductAction,
  createOwnerAction,
  createHealthPaddockAction,
  listHealthPaddocksAction,
  type PreviewResult,
} from "@/app/(protected)/activities/health/actions";
import type { ColumnMapping } from "@/lib/activities/column-mapping";
import type { HealthProduct } from "@/lib/activities/health";
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
      dose: "",
      doseUnit: matched?.defaultDoseUnit ?? "",
      route: "",
      withdrawalDays: matched?.defaultWithdrawalDays ?? null,
      notes: null,
    };
  });
  const suggestedNames = suggestions.map((s) => (s.matchedProductId ? null : s.rawValue));
  return { products, suggestedNames };
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
  catalog: initialCatalog,
  ownerCatalog: initialOwnerCatalog,
  farms,
}: {
  catalog: ProductCatalogEntry[];
  ownerCatalog: OwnerCatalogEntry[];
  farms: { id: string; name: string }[];
}) {
  const [farmId, setFarmId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [eventDate, setEventDate] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [rows, setRows] = useState<ResolvedRow[]>([]);
  const [catalog, setCatalog] = useState<ProductCatalogEntry[]>(initialCatalog);
  const [ownerCatalog, setOwnerCatalog] = useState<OwnerCatalogEntry[]>(initialOwnerCatalog);
  const [paddocks, setPaddocks] = useState<PaddockCatalogEntry[]>([]);
  const [paddockId, setPaddockId] = useState<string | null>(null);
  const [products, setProducts] = useState<HealthProduct[]>([emptyProduct()]);
  const [suggestedNames, setSuggestedNames] = useState<(string | null)[]>([null]);
  const [confirmed, setConfirmed] = useState(false);

  async function handleFarmChange(selected: string) {
    setFarmId(selected);
    setEventDate("");
    setPreview(null);
    setRows([]);
    setPaddockId(null);
    if (!selected) {
      setPaddocks([]);
      return;
    }
    setPaddocks(await listHealthPaddocksAction(selected));
  }

  function handleFileChange(selected: File | null) {
    setFile(selected);
    setEventDate("");
  }

  async function runPreview(mapping?: ColumnMapping[]) {
    if (!file || !farmId) return;
    const formData = new FormData();
    formData.set("file", file);
    formData.set("eventDate", eventDate);
    formData.set("farmId", farmId);
    if (mapping) formData.set("mapping", JSON.stringify(mapping));
    const result = await previewHealthBatch(formData);
    setPreview(result);
    if (!result.mappingNeeded && !result.eventDateNeeded) {
      setRows(result.rows);
      const built = buildInitialProducts(result.productSuggestions, catalog);
      setProducts(built.products);
      setSuggestedNames(built.suggestedNames);
    }
  }

  async function handleSubmitEventDate() {
    if (!preview || preview.mappingNeeded || !preview.eventDateNeeded) return;
    await runPreview(preview.mapping);
  }

  async function handleCreateProduct(name: string): Promise<ProductCatalogEntry> {
    const created = await createProductAction(name);
    setCatalog((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
  }

  async function handleCreateOwner(name: string): Promise<OwnerCatalogEntry> {
    const created = await createOwnerAction(name);
    setOwnerCatalog((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
  }

  async function handleCreatePaddock(name: string): Promise<PaddockCatalogEntry> {
    const created = await createHealthPaddockAction(farmId, name);
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
    if (!preview || preview.mappingNeeded || preview.eventDateNeeded) return;
    await confirmHealthBatchAction({
      headerSignature: preview.headerSignature,
      mapping: preview.mapping,
      products,
      rows,
      paddockId,
      farmId,
    });
    setConfirmed(true);
  }

  if (confirmed) {
    return <p>Lote confirmado.</p>;
  }

  const hasIncompleteProduct = products.some((p) => !p.productId || !p.dose || !p.doseUnit || !p.route);
  const pendingNames = pendingOwnerNames(rows);
  const hasConfirmableRow = rows.some(
    (r) =>
      r.status === "new" || r.status === "existing" || r.status === "wrong_farm" || (r.status === "foreign" && r.forced)
  );

  return (
    <div className="flex flex-col gap-4">
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
      <div className="flex flex-col gap-2">
        <Label htmlFor="file">Archivo</Label>
        <Input id="file" type="file" onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)} />
      </div>
      <Button type="button" disabled={!farmId || !file} onClick={() => runPreview()}>
        Subir
      </Button>

      {preview?.mappingNeeded ? (
        <ColumnMapper
          headers={preview.headers}
          availableMeanings={["tag", "date", "category", "product", "sex", "owner", "notes", "ignore"]}
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
          <ProductListEditor
            catalog={catalog}
            products={products}
            suggestedNames={suggestedNames}
            onChange={setProducts}
            onCreateProduct={handleCreateProduct}
          />
          <PaddockSelector
            paddocks={paddocks}
            paddockId={paddockId}
            onChange={setPaddockId}
            onCreatePaddock={handleCreatePaddock}
            label="Potrero"
          />
          <PendingOwnerEditor
            pendingNames={pendingNames}
            ownerCatalog={ownerCatalog}
            onCreateOwner={handleCreateOwner}
            onResolved={handleOwnerResolved}
          />
          <TransferPreviewTable rows={rows} onToggleForced={handleToggleForced} />
          <Button
            type="button"
            disabled={
              rows.some((r) => r.status === "error") || hasIncompleteProduct || pendingNames.length > 0 || !hasConfirmableRow
            }
            onClick={handleConfirm}
          >
            Confirmar
          </Button>
        </div>
      ) : null}
    </div>
  );
}
