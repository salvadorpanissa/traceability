"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { columnMapping } from "@/db/schema";
import { requireSession } from "@/lib/dal/session";
import { requireFarmAccess } from "@/lib/dal/farm-access";
import { parseExcelFile } from "@/lib/activities/excel-parsing";
import {
  computeHeaderSignature,
  applyColumnMapping,
  extractProductColumnValues,
  type ColumnMapping,
} from "@/lib/activities/column-mapping";
import { resolveBatchRows, type ResolvedRow } from "@/lib/activities/batch-resolution";
import { confirmHealthBatch, type HealthProduct } from "@/lib/activities/health";
import { listProducts, createProduct, type ProductCatalogEntry } from "@/lib/dal/product-catalog";
import { createOwner, type OwnerCatalogEntry } from "@/lib/dal/owner-catalog";
import { listPaddocksByFarm, createPaddock, type PaddockCatalogEntry } from "@/lib/dal/paddock-catalog";

export type PreviewResult =
  | { mappingNeeded: true; headers: string[]; initialMapping: ColumnMapping[] | null }
  | { mappingNeeded: false; eventDateNeeded: true; headerSignature: string; mapping: ColumnMapping[] }
  | {
      mappingNeeded: false;
      eventDateNeeded: false;
      headerSignature: string;
      mapping: ColumnMapping[];
      rows: ResolvedRow[];
      productSuggestions: { rawValue: string; matchedProductId: string | null }[];
    };

function hasUnconfiguredColumn(mapping: ColumnMapping[]): boolean {
  return mapping.some((m) => m.meaning === "ignore");
}

async function requireOperatingFarmId(): Promise<string> {
  const cookieStore = await cookies();
  const activeFarmId = cookieStore.get("active_farm_id")?.value;
  if (!activeFarmId) {
    throw new Error("No hay un campo activo seleccionado");
  }
  return activeFarmId;
}

export async function previewHealthBatch(formData: FormData): Promise<PreviewResult> {
  await requireSession();
  const operatingFarmId = await requireOperatingFarmId();

  const file = formData.get("file") as File;
  const eventDateInput = formData.get("eventDate") as string | null;
  const eventDate = eventDateInput && eventDateInput.length > 0 ? eventDateInput : null;
  const mappingOverride = formData.get("mapping") as string | null;

  const buffer = await file.arrayBuffer();
  const { headers, rows } = await parseExcelFile(buffer);
  const headerSignature = computeHeaderSignature(headers);

  let mapping: ColumnMapping[];
  if (mappingOverride) {
    mapping = JSON.parse(mappingOverride) as ColumnMapping[];
  } else {
    const [existing] = await db.select().from(columnMapping).where(eq(columnMapping.headerSignature, headerSignature));
    if (!existing) {
      return { mappingNeeded: true, headers, initialMapping: null };
    }
    const existingMapping = existing.mapping as ColumnMapping[];
    if (hasUnconfiguredColumn(existingMapping)) {
      return { mappingNeeded: true, headers, initialMapping: existingMapping };
    }
    mapping = existingMapping;
  }

  const hasDateColumn = mapping.some((m) => m.meaning === "date");
  if (!hasDateColumn && !eventDate) {
    return { mappingNeeded: false, eventDateNeeded: true, headerSignature, mapping };
  }

  const mappedRows = applyColumnMapping(headers, rows, mapping);
  const resolvedRows = await resolveBatchRows(mappedRows, hasDateColumn ? null : eventDate, operatingFarmId);

  const productValues = extractProductColumnValues(headers, rows, mapping);
  const catalog = await listProducts();
  const productSuggestions = productValues.map((rawValue) => {
    const matched = catalog.find((entry) => entry.name.trim().toLowerCase() === rawValue.trim().toLowerCase());
    return { rawValue, matchedProductId: matched?.id ?? null };
  });

  return {
    mappingNeeded: false,
    eventDateNeeded: false,
    headerSignature,
    mapping,
    rows: resolvedRows,
    productSuggestions,
  };
}

export async function confirmHealthBatchAction(input: {
  headerSignature: string;
  mapping: ColumnMapping[];
  products: HealthProduct[];
  rows: ResolvedRow[];
  paddockId: string | null;
}): Promise<void> {
  const session = await requireSession();
  const operatingFarmId = await requireOperatingFarmId();
  await requireFarmAccess(session.user.id, session.user.role, operatingFarmId);

  await db
    .insert(columnMapping)
    .values({ headerSignature: input.headerSignature, mapping: input.mapping })
    .onConflictDoUpdate({ target: columnMapping.headerSignature, set: { mapping: input.mapping } });

  await confirmHealthBatch({
    userId: session.user.id,
    role: session.user.role,
    operatingFarmId,
    products: input.products,
    rows: input.rows,
    paddockId: input.paddockId,
  });
}

export async function createProductAction(name: string): Promise<ProductCatalogEntry> {
  await requireSession();
  return createProduct(name);
}

export async function createOwnerAction(name: string): Promise<OwnerCatalogEntry> {
  await requireSession();
  return createOwner(name);
}

export async function listHealthPaddocksAction(): Promise<PaddockCatalogEntry[]> {
  const session = await requireSession();
  const operatingFarmId = await requireOperatingFarmId();
  await requireFarmAccess(session.user.id, session.user.role, operatingFarmId);
  return listPaddocksByFarm(operatingFarmId);
}

export async function createHealthPaddockAction(name: string): Promise<PaddockCatalogEntry> {
  const session = await requireSession();
  const operatingFarmId = await requireOperatingFarmId();
  await requireFarmAccess(session.user.id, session.user.role, operatingFarmId);
  return createPaddock(operatingFarmId, name);
}
