"use server";

import { requireSession } from "@/lib/dal/session";
import { getGuideDocumentFile } from "@/lib/dal/guide-documents";

export type DownloadedGuideDocument = { fileName: string; mimeType: string; base64: string };

export async function downloadGuideDocumentAction(batchId: string): Promise<DownloadedGuideDocument | null> {
  const session = await requireSession();
  const file = await getGuideDocumentFile(batchId, session.user.id, session.user.role);
  if (!file) return null;
  return { fileName: file.fileName, mimeType: file.mimeType, base64: file.data.toString("base64") };
}
