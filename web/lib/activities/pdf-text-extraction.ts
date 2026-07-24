// pdfjs-dist's legacy Node build is meant to run without a browser worker,
// but that only holds under a plain `node`/`tsx` process. Bundled into a
// Next.js server action (Turbopack), pdfjs's fallback path still tries to
// dynamically import its worker file relative to the bundle's own chunk
// directory (".next/.../chunks/ssr/pdf.worker.mjs"), which Turbopack never
// emits there — that dynamic import 404s with "Setting up fake worker
// failed". The documented Node workaround is to import the worker module
// ourselves and register it as `globalThis.pdfjsWorker`: pdfjs's internal
// PDFWorker checks `globalThis.pdfjsWorker?.WorkerMessageHandler` first and,
// when present, runs entirely on the main thread without ever attempting
// that dynamic import.
import path from "path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { WorkerMessageHandler } from "pdfjs-dist/legacy/build/pdf.worker.mjs";

const globalWithPdfjsWorker = globalThis as typeof globalThis & {
  pdfjsWorker?: { WorkerMessageHandler: typeof WorkerMessageHandler };
};
globalWithPdfjsWorker.pdfjsWorker ??= { WorkerMessageHandler };

export type PositionedTextItem = { page: number; x: number; y: number; text: string };

export async function extractPositionedTextItems(buffer: ArrayBuffer): Promise<PositionedTextItem[]> {
  const pdfJsDistPath = path.dirname(require.resolve("pdfjs-dist/package.json"));
  const standardFontDataUrl = `${path.join(pdfJsDistPath, "standard_fonts")}/`;
  const pdf = await getDocument({ data: new Uint8Array(buffer), standardFontDataUrl }).promise;
  const items: PositionedTextItem[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      items.push({ page: pageNumber, x: item.transform[4], y: item.transform[5], text: item.str });
    }
  }

  return items;
}

// A PDF's text stream has no inherent line structure — this reconstructs
// visual reading order (left to right, top to bottom, page by page) by
// bucketing items with close-enough y coordinates as the same line, then
// sorting each bucket left to right. 3pt tolerance absorbs the sub-pixel y
// jitter that can appear between text runs meant to sit on the same line.
export function reconstructLines(items: PositionedTextItem[]): string[] {
  const byPageAndY = new Map<string, PositionedTextItem[]>();
  for (const item of items) {
    const yBucket = Math.round(item.y / 3) * 3;
    const key = `${item.page}:${yBucket}`;
    const bucket = byPageAndY.get(key) ?? [];
    bucket.push(item);
    byPageAndY.set(key, bucket);
  }

  const sortedKeys = Array.from(byPageAndY.keys()).sort((a, b) => {
    const [pageA, yA] = a.split(":").map(Number);
    const [pageB, yB] = b.split(":").map(Number);
    if (pageA !== pageB) return pageA - pageB;
    return yB - yA; // PDF y grows upward; reading order goes top to bottom
  });

  return sortedKeys.map((key) => {
    const bucket = byPageAndY.get(key)!;
    bucket.sort((a, b) => a.x - b.x);
    return bucket
      .map((i) => i.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  });
}
