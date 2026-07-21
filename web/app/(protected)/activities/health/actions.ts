"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { columnMapping } from "@/db/schema";
import { requireSession } from "@/lib/dal/session";
import { parseExcelFile } from "@/lib/activities/excel-parsing";
import { computeHeaderSignature, applyColumnMapping, type ColumnMapping } from "@/lib/activities/column-mapping";
import { resolveBatchRows, type ResolvedRow } from "@/lib/activities/batch-resolution";
import { confirmHealthBatch, type HealthProduct } from "@/lib/activities/health";

export type PreviewResult =
  | { mappingNeeded: true; headers: string[] }
  | { mappingNeeded: false; headerSignature: string; mapping: ColumnMapping[]; rows: ResolvedRow[] };

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

  const file = formData.get("file") as File;
  const eventDate = formData.get("eventDate") as string;
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
      return { mappingNeeded: true, headers };
    }
    mapping = existing.mapping as ColumnMapping[];
  }

  const mappedRows = applyColumnMapping(headers, rows, mapping);
  const resolvedRows = await resolveBatchRows(mappedRows, eventDate);

  return { mappingNeeded: false, headerSignature, mapping, rows: resolvedRows };
}

export async function confirmHealthBatchAction(input: {
  headerSignature: string;
  mapping: ColumnMapping[];
  products: HealthProduct[];
  rows: ResolvedRow[];
}): Promise<void> {
  const session = await requireSession();
  const operatingFarmId = await requireOperatingFarmId();

  await db
    .insert(columnMapping)
    .values({ headerSignature: input.headerSignature, mapping: input.mapping })
    .onConflictDoNothing({ target: columnMapping.headerSignature });

  await confirmHealthBatch({
    userId: session.user.id,
    role: session.user.role,
    operatingFarmId,
    products: input.products,
    rows: input.rows,
  });
}
