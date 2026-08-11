import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { batchOperation, event, eventTransfer, establishment } from "@/db/schema";
import { isAdmin, requireEstablishmentAccess, userEstablishmentIds } from "@/lib/dal/farm-access";

export type GuideDocumentSummary = {
  batchId: string;
  fileName: string;
  mimeType: string;
  createdAt: Date;
  animalCount: number;
  guideNumber: string | null;
  originEstablishmentName: string | null;
  destinationEstablishmentName: string;
};

// Only batches created from an uploaded guide PDF carry these columns — the
// Excel path leaves them null, so it's naturally excluded by the isNotNull
// filter. Scoped like every other DAL read here: an admin sees every
// establecimiento's guides, a manager only the ones operated from an
// establecimiento they're assigned to.
export async function listGuideDocuments(
  userId: string,
  role: string | undefined
): Promise<GuideDocumentSummary[]> {
  const establishmentIds = isAdmin(role) ? null : await userEstablishmentIds(userId);
  if (establishmentIds && establishmentIds.length === 0) return [];

  const batches = await db
    .select({
      batchId: batchOperation.id,
      fileName: batchOperation.guideFileName,
      mimeType: batchOperation.guideMimeType,
      createdAt: batchOperation.createdAt,
      animalCount: batchOperation.animalCount,
      destinationEstablishmentName: establishment.name,
    })
    .from(batchOperation)
    .innerJoin(establishment, eq(establishment.id, batchOperation.establishmentId))
    .where(
      establishmentIds
        ? and(isNotNull(batchOperation.guideFileData), inArray(batchOperation.establishmentId, establishmentIds))
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
      originEstablishmentName: establishment.name,
    })
    .from(event)
    .innerJoin(eventTransfer, eq(eventTransfer.eventId, event.id))
    .innerJoin(establishment, eq(establishment.id, eventTransfer.originEstablishmentId))
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
      originEstablishmentName: guideInfo?.originEstablishmentName ?? null,
      destinationEstablishmentName: batch.destinationEstablishmentName,
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
      establishmentId: batchOperation.establishmentId,
      fileName: batchOperation.guideFileName,
      mimeType: batchOperation.guideMimeType,
      data: batchOperation.guideFileData,
    })
    .from(batchOperation)
    .where(eq(batchOperation.id, batchId));

  if (!batch) return null;

  // Access must be checked before deciding whether a document is attached —
  // otherwise a caller without establecimiento access could distinguish "no
  // such batch/no document" (null) from "batch exists with a document, but I
  // can't see it" (thrown) for an establecimiento they aren't assigned to.
  await requireEstablishmentAccess(userId, role, batch.establishmentId);

  if (!batch.data || !batch.fileName || !batch.mimeType) return null;

  return { fileName: batch.fileName, mimeType: batch.mimeType, data: batch.data };
}
