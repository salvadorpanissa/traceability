"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColumnMapper } from "@/components/activities/column-mapper";
import { TransferPreviewTable } from "@/components/activities/transfer-preview-table";
import { ProductListEditor, emptyProduct } from "@/components/activities/product-list-editor";
import { PendingOwnerEditor } from "@/components/activities/pending-owner-editor";
import {
  previewHealthBatch,
  confirmHealthBatchAction,
  createProductAction,
  createOwnerAction,
  type PreviewResult,
} from "@/app/(protected)/activities/health/actions";
import type { ColumnMapping } from "@/lib/activities/column-mapping";
import type { HealthProduct } from "@/lib/activities/health";
import type { ResolvedRow } from "@/lib/activities/batch-resolution";
import type { ProductCatalogEntry } from "@/lib/dal/product-catalog";
import type { OwnerCatalogEntry } from "@/lib/dal/owner-catalog";

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
  const names = rows
    .filter((r): r is Extract<ResolvedRow, { status: "new" }> => r.status === "new" && !!r.pendingOwnerName)
    .map((r) => r.pendingOwnerName as string);
  return Array.from(new Set(names));
}

export function HealthForm({ catalog: initialCatalog }: { catalog: ProductCatalogEntry[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [rows, setRows] = useState<ResolvedRow[]>([]);
  const [catalog, setCatalog] = useState<ProductCatalogEntry[]>(initialCatalog);
  const [products, setProducts] = useState<HealthProduct[]>([emptyProduct()]);
  const [suggestedNames, setSuggestedNames] = useState<(string | null)[]>([null]);
  const [confirmed, setConfirmed] = useState(false);

  async function runPreview(mapping?: ColumnMapping[]) {
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    formData.set("eventDate", eventDate);
    if (mapping) formData.set("mapping", JSON.stringify(mapping));
    const result = await previewHealthBatch(formData);
    setPreview(result);
    if (!result.mappingNeeded) {
      setRows(result.rows);
      const built = buildInitialProducts(result.productSuggestions, catalog);
      setProducts(built.products);
      setSuggestedNames(built.suggestedNames);
    }
  }

  async function handleCreateProduct(name: string): Promise<ProductCatalogEntry> {
    const created = await createProductAction(name);
    setCatalog((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
  }

  async function handleCreateOwner(name: string): Promise<OwnerCatalogEntry> {
    return createOwnerAction(name);
  }

  function handleOwnerResolved(rawName: string, ownerId: string) {
    setRows((prev) =>
      prev.map((r) => (r.status === "new" && r.pendingOwnerName === rawName ? { ...r, ownerId, pendingOwnerName: null } : r))
    );
  }

  async function handleConfirm() {
    if (!preview || preview.mappingNeeded) return;
    await confirmHealthBatchAction({
      headerSignature: preview.headerSignature,
      mapping: preview.mapping,
      products,
      rows,
    });
    setConfirmed(true);
  }

  if (confirmed) {
    return <p>Lote confirmado.</p>;
  }

  const hasIncompleteProduct = products.some((p) => !p.productId || !p.dose || !p.doseUnit || !p.route);
  const pendingNames = pendingOwnerNames(rows);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="file">Archivo</Label>
        <Input id="file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="eventDate">Fecha</Label>
        <Input id="eventDate" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
      </div>
      <Button type="button" onClick={() => runPreview()}>
        Subir
      </Button>

      {preview?.mappingNeeded ? (
        <ColumnMapper
          headers={preview.headers}
          availableMeanings={["tag", "date", "category", "product", "sex", "owner", "ignore"]}
          initialMapping={preview.initialMapping}
          onSubmit={(mapping) => runPreview(mapping)}
        />
      ) : null}

      {preview && !preview.mappingNeeded ? (
        <div className="flex flex-col gap-4">
          <ProductListEditor
            catalog={catalog}
            products={products}
            suggestedNames={suggestedNames}
            onChange={setProducts}
            onCreateProduct={handleCreateProduct}
          />
          <PendingOwnerEditor pendingNames={pendingNames} onCreateOwner={handleCreateOwner} onResolved={handleOwnerResolved} />
          <TransferPreviewTable rows={rows} />
          <Button
            type="button"
            disabled={rows.some((r) => r.status === "error") || hasIncompleteProduct || pendingNames.length > 0}
            onClick={handleConfirm}
          >
            Confirmar
          </Button>
        </div>
      ) : null}
    </div>
  );
}
