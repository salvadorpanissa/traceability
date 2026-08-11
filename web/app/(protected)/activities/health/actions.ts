"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { columnMapping } from "@/db/schema";
import { requireSession } from "@/lib/dal/session";
import { requireEstablishmentAccess, getEstablishmentFarmId } from "@/lib/dal/farm-access";
import { requireFile } from "@/lib/dal/form-data";
import { parseExcelFile } from "@/lib/activities/excel-parsing";
import {
  computeHeaderSignature,
  applyColumnMapping,
  extractProductColumnValues,
  type ColumnMapping,
} from "@/lib/activities/column-mapping";
import { resolveBatchRows, type ResolvedRow } from "@/lib/activities/batch-resolution";
import { confirmHealthBatch, voidHealthBatch, type HealthProduct } from "@/lib/activities/health";
import { healthBatchDetail, type HealthBatchDetail } from "@/lib/dashboard/health-batch-summary";
import { listProductsByFarm, createProduct, type ProductCatalogEntry } from "@/lib/dal/product-catalog";
import { createOwner, type OwnerCatalogEntry } from "@/lib/dal/owner-catalog";
import { listPaddocksByEstablishment, createPaddock, type PaddockCatalogEntry } from "@/lib/dal/paddock-catalog";

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

export async function previewHealthBatch(formData: FormData): Promise<PreviewResult> {
  const session = await requireSession();
  const operatingEstablishmentId = formData.get("establishmentId") as string;
  await requireEstablishmentAccess(session.user.id, session.user.role, operatingEstablishmentId);

  const file = requireFile(formData, "file");
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
  const resolvedRows = await resolveBatchRows(mappedRows, hasDateColumn ? null : eventDate, operatingEstablishmentId, {
    autoForceForeignWithoutOwner: true,
  });

  const productValues = extractProductColumnValues(headers, rows, mapping);
  const farmId = await getEstablishmentFarmId(operatingEstablishmentId);
  const catalog = farmId ? await listProductsByFarm(farmId) : [];
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
  establishmentId: string;
  transferMismatchedToPaddock?: boolean;
}): Promise<void> {
  const session = await requireSession();
  await requireEstablishmentAccess(session.user.id, session.user.role, input.establishmentId);

  await db
    .insert(columnMapping)
    .values({ headerSignature: input.headerSignature, mapping: input.mapping })
    .onConflictDoUpdate({ target: columnMapping.headerSignature, set: { mapping: input.mapping } });

  await confirmHealthBatch({
    userId: session.user.id,
    role: session.user.role,
    operatingEstablishmentId: input.establishmentId,
    products: input.products,
    rows: input.rows,
    paddockId: input.paddockId,
    transferMismatchedToPaddock: input.transferMismatchedToPaddock,
  });
}

export async function createProductAction(establishmentId: string, name: string): Promise<ProductCatalogEntry> {
  const session = await requireSession();
  await requireEstablishmentAccess(session.user.id, session.user.role, establishmentId);
  const farmId = await getEstablishmentFarmId(establishmentId);
  if (!farmId) throw new Error("Campo no encontrado");
  return createProduct(farmId, name);
}

export async function listProductsAction(establishmentId: string): Promise<ProductCatalogEntry[]> {
  const session = await requireSession();
  await requireEstablishmentAccess(session.user.id, session.user.role, establishmentId);
  const farmId = await getEstablishmentFarmId(establishmentId);
  return farmId ? listProductsByFarm(farmId) : [];
}

export async function createOwnerAction(name: string): Promise<OwnerCatalogEntry> {
  await requireSession();
  return createOwner(name);
}

export async function createHealthPaddockAction(establishmentId: string, name: string): Promise<PaddockCatalogEntry> {
  const session = await requireSession();
  await requireEstablishmentAccess(session.user.id, session.user.role, establishmentId);
  return createPaddock(establishmentId, name);
}

export async function listPaddocksAction(establishmentId: string): Promise<PaddockCatalogEntry[]> {
  const session = await requireSession();
  await requireEstablishmentAccess(session.user.id, session.user.role, establishmentId);
  return listPaddocksByEstablishment(establishmentId);
}

export async function voidHealthBatchAction(batchId: string): Promise<void> {
  const session = await requireSession();
  await voidHealthBatch({ userId: session.user.id, role: session.user.role, batchOperationId: batchId });
}

export async function getHealthBatchDetailAction(batchId: string): Promise<HealthBatchDetail | null> {
  const session = await requireSession();
  return healthBatchDetail(batchId, session.user.id, session.user.role);
}
