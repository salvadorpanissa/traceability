"use server";

import { requireSession } from "@/lib/dal/session";
import { parseExcelFile } from "@/lib/activities/excel-parsing";
import { importOwnTags, countOwnTagsByRegistration, type OwnTagImportResult } from "@/lib/dal/own-tag";
import { listDicoseRegistrations, type DicoseRegistrationEntry } from "@/lib/dal/dicose-registration";

export async function uploadOwnTags(dicoseRegistrationId: string, formData: FormData): Promise<OwnTagImportResult> {
  const session = await requireSession();
  const file = formData.get("file") as File;
  const buffer = await file.arrayBuffer();
  const { rows } = await parseExcelFile(buffer);
  const rawValues = rows.map((row) => row[0] ?? "");
  return importOwnTags(dicoseRegistrationId, session.user.id, rawValues);
}

export async function listOwnTagCounts(): Promise<
  { registration: DicoseRegistrationEntry; count: number; lastUploadedAt: string | null }[]
> {
  await requireSession();
  const [registrations, counts] = await Promise.all([listDicoseRegistrations(), countOwnTagsByRegistration()]);
  const countByRegistrationId = new Map(counts.map((c) => [c.dicoseRegistrationId, c]));
  return registrations.map((registration) => {
    const match = countByRegistrationId.get(registration.id);
    return {
      registration,
      count: match?.count ?? 0,
      lastUploadedAt: match?.lastUploadedAt ? match.lastUploadedAt.toISOString() : null,
    };
  });
}
