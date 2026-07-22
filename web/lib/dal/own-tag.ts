import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { ownTag } from "@/db/schema";

export type OwnTagImportResult = { inserted: number; skipped: number; invalid: number };

const CARAVAN_PATTERN = /^\d+$/;

export async function importOwnTags(
  dicoseRegistrationId: string,
  userId: string,
  rawValues: string[]
): Promise<OwnTagImportResult> {
  let invalid = 0;
  let validCount = 0;
  const uniqueValidTags = new Set<string>();

  for (const raw of rawValues) {
    const tag = raw.trim();
    if (!tag) continue;
    if (!CARAVAN_PATTERN.test(tag)) {
      invalid++;
      continue;
    }
    validCount++;
    uniqueValidTags.add(tag);
  }

  const candidateTags = [...uniqueValidTags];
  if (candidateTags.length === 0) {
    return { inserted: 0, skipped: validCount, invalid };
  }

  const existingRows = await db.select({ tag: ownTag.tag }).from(ownTag).where(inArray(ownTag.tag, candidateTags));
  const existingTags = new Set(existingRows.map((r) => r.tag));
  const newTags = candidateTags.filter((tag) => !existingTags.has(tag));

  if (newTags.length > 0) {
    await db.insert(ownTag).values(newTags.map((tag) => ({ tag, dicoseRegistrationId, createdBy: userId })));
  }

  return { inserted: newTags.length, skipped: validCount - newTags.length, invalid };
}

export async function countOwnTagsByRegistration(): Promise<
  { dicoseRegistrationId: string; count: number; lastUploadedAt: Date | null }[]
> {
  const rows = await db
    .select({
      dicoseRegistrationId: ownTag.dicoseRegistrationId,
      count: sql<number>`count(*)::int`,
      lastUploadedAt: sql<string | null>`max(${ownTag.createdAt})`,
    })
    .from(ownTag)
    .groupBy(ownTag.dicoseRegistrationId);

  return rows.map((row) => ({
    ...row,
    lastUploadedAt: row.lastUploadedAt ? new Date(row.lastUploadedAt) : null,
  }));
}
