// pdfjs-dist's legacy Node build runs without a browser worker, which is
// what makes text extraction usable directly from a server action.
import path from "path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

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
