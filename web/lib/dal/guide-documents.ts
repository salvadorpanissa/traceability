import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { batchOperation, event, eventTransfer, farm } from "@/db/schema";
import { isAdmin, requireFarmAccess, userFarmIds } from "@/lib/dal/farm-access";

export type GuideDocumentSummary = {
  batchId: string;
  fileName: string;
  mimeType: string;
  createdAt: Date;
  animalCount: number;
  guideNumber: string | null;
  originFarmName: string | null;
  destinationFarmName: string;
};

// Only batches created from an uploaded guide PDF carry these columns — the
// Excel path leaves them null, so it's naturally excluded by the isNotNull
// filter. Scoped like every other DAL read here: an admin sees every farm's
// guides, a manager only the ones operated from a farm they're assigned to.
export async function listGuideDocuments(
  userId: string,
  role: string | undefined
): Promise<GuideDocumentSummary[]> {
  const farmIds = isAdmin(role) ? null : await userFarmIds(userId);
  if (farmIds && farmIds.length === 0) return [];

  const batches = await db
    .select({
      batchId: batchOperation.id,
      fileName: batchOperation.guideFileName,
      mimeType: batchOperation.guideMimeType,
      createdAt: batchOperation.createdAt,
      animalCount: batchOperation.animalCount,
      destinationFarmName: farm.name,
    })
    .from(batchOperation)
    .innerJoin(farm, eq(farm.id, batchOperation.farmId))
    .where(
      farmIds
        ? and(isNotNull(batchOperation.guideFileData), inArray(batchOperation.farmId, farmIds))
        : isNotNull(batchOperation.guideFileData)
    )
    .orderBy(desc(batchOperation.createdAt));

  if (batches.length === 0) return [];

  // A batch's guideNumber/origin is set once per confirm call and shared by
  // every row in it — any one event from the batch identifies it, so no
  // need to distinguish which row this picks among several.
  const guideInfoRows = await db
    .select({
      batchOperationId: event.batchOperationId,
      guideNumber: eventTransfer.guideNumber,
      originFarmName: farm.name,
    })
    .from(event)
    .innerJoin(eventTransfer, eq(eventTransfer.eventId, event.id))
    .innerJoin(farm, eq(farm.id, eventTransfer.originFarmId))
    .where(
      inArray(
        event.batchOperationId,
        batches.map((b) => b.batchId)
      )
    );
  const guideInfoByBatch = new Map(guideInfoRows.map((row) => [row.batchOperationId, row]));

  return batches.map((batch) => {
    const guideInfo = guideInfoByBatch.get(batch.batchId);
    return {
      batchId: batch.batchId,
      fileName: batch.fileName ?? "guia.pdf",
      mimeType: batch.mimeType ?? "application/pdf",
      createdAt: batch.createdAt,
      animalCount: batch.animalCount,
      guideNumber: guideInfo?.guideNumber ?? null,
      originFarmName: guideInfo?.originFarmName ?? null,
      destinationFarmName: batch.destinationFarmName,
    };
  });
}

export type GuideDocumentFile = { fileName: string; mimeType: string; data: Buffer };

export async function getGuideDocumentFile(
  batchId: string,
  userId: string,
  role: string | undefined
): Promise<GuideDocumentFile | null> {
  const [batch] = await db
    .select({
      farmId: batchOperation.farmId,
      fileName: batchOperation.guideFileName,
      mimeType: batchOperation.guideMimeType,
      data: batchOperation.guideFileData,
    })
    .from(batchOperation)
    .where(eq(batchOperation.id, batchId));

  if (!batch) return null;

  // Access must be checked before deciding whether a document is attached —
  // otherwise a caller without farm access could distinguish "no such batch
  // /no document" (null) from "batch exists with a document, but I can't see
  // it" (thrown) for a farm they aren't assigned to.
  await requireFarmAccess(userId, role, batch.farmId);

  if (!batch.data || !batch.fileName || !batch.mimeType) return null;

  return { fileName: batch.fileName, mimeType: batch.mimeType, data: batch.data };
}
