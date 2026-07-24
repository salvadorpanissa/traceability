# Guía SNIG (PDF) en Traslados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user load a Transfer batch by uploading a SNIG "Constancia de Propiedad y Tránsito" PDF instead of an Excel file — the system parses the guide, resolves origin/destination farms from its DICOSE codes, and pre-fills date/guide number/animal list, reusing the existing batch-resolution and confirm pipeline.

**Architecture:** A new PDF text-extraction layer (`pdfjs-dist`, position-aware) feeds a guide-specific parser (`parseSnigGuide`) that produces a typed `SnigGuide`. A new DAL lookup resolves DICOSE codes to farms via the existing `dicose_registration` table. The guide's animals are converted into the same `MappedRow[]` shape the Excel path already produces, so `resolveBatchRows` and the preview/confirm pipeline are reused unchanged in their core logic — only `confirmTransferBatch` gains two new optional inputs (explicit origin farm, guide number) that the Excel path never sets, so its behavior is untouched. A new UI component adds a PDF upload mode alongside the existing Excel mode on the Transfer page.

**Tech Stack:** Next.js 16 App Router (server components + server actions), Drizzle ORM / Postgres, `pdfjs-dist` (PDF text extraction, new dependency), `pdf-lib` (synthetic PDF fixture generation for tests, new dev dependency), Vitest + Testing Library, Playwright.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-23-snig-guide-transfer-import-design.md` — read it before starting if anything below is ambiguous.
- This sub-project covers **Transfer only**. Sale does not exist yet and is out of scope.
- The Excel upload flow (`ColumnMapper`, `previewTransferBatch`, `confirmTransferBatchAction`) must not change behavior. All PDF-path additions are new functions/components alongside it.
- No automatic detection of "traslado vs. venta" from "CAMBIO DE PROPIEDAD" — this feature only ever produces a Transfer batch.
- `parseSnigGuide` throws a descriptive `Error` when a required field (guide number, date, DICOSE C, DICOSE D, or at least one animal) is missing — never guesses or returns partial data.
- Do not commit the real sample PDF (`D838153.pdf`, real business names/DICOSE codes) into the repository. All automated tests use a synthetic fixture built with `pdf-lib` (Task 1). The real file is only used for a manual, undocumented-in-git verification step in Task 1 and Task 2, run locally from its actual location on disk.
- Age → birth date: `eventDate` from the guide minus `ageMonths` months, approximated to the 1st of the resulting month — same precision convention `normalizeDate` already uses for `mm/yyyy` input.
- Run `npm test` (vitest) from `web/` after every task's implementation step.

---

### Task 1: PDF positioned-text extraction + synthetic guide fixture builder

**Files:**
- Modify: `web/package.json` (add `pdfjs-dist` dependency, `pdf-lib` dev dependency)
- Create: `web/lib/activities/pdf-text-extraction.ts`
- Create: `web/test/snig-guide-fixture.ts`
- Create: `web/__tests__/lib/activities/pdf-text-extraction.test.ts`

**Interfaces:**
- Produces: `extractPositionedTextItems(buffer: ArrayBuffer): Promise<PositionedTextItem[]>` where `PositionedTextItem = { page: number; x: number; y: number; text: string }`.
- Produces: `reconstructLines(items: PositionedTextItem[]): string[]` — one string per visual line, left-to-right, top-to-bottom, across all pages in order.
- Produces (test-only, not part of the app bundle): `buildSnigGuideFixturePdf(input: SnigGuideFixtureInput): Promise<ArrayBuffer>` in `web/test/snig-guide-fixture.ts`, where:
  ```ts
  export type SnigGuideFixtureInput = {
    guideNumber: string;
    eventDateDisplay: string; // "11/07/2026"
    dicoseA: string;
    dicoseB: string;
    dicoseC: string;
    dicoseD: string;
    animals: { tag: string; sex: "H" | "M"; ageMonths: number }[];
  };
  ```

- [ ] **Step 1: Add dependencies**

```bash
cd web
npm install pdfjs-dist
npm install --save-dev pdf-lib
```

- [ ] **Step 2: Write the fixture builder**

Create `web/test/snig-guide-fixture.ts`:

```ts
import { PDFDocument, StandardFonts } from "pdf-lib";

export type SnigGuideFixtureInput = {
  guideNumber: string;
  eventDateDisplay: string;
  dicoseA: string;
  dicoseB: string;
  dicoseC: string;
  dicoseD: string;
  animals: { tag: string; sex: "H" | "M"; ageMonths: number }[];
};

const OWNER_NAME = "PANISSA SILVA ANTONIO Y HORACIO";
const PAGE_SIZE: [number, number] = [595, 842];
const LEFT_MARGIN = 50;
const RIGHT_COLUMN_X = 300;
const TOP_Y = 800;
const LINE_HEIGHT = 20;
const BOTTOM_MARGIN = 50;

// Mirrors the real SNIG guide's layout closely enough to exercise the
// parser's line-reconstruction and regex matching: label+value pairs drawn
// as a single line each (page 1 header block), and the numbered animal list
// drawn two-per-line across possibly multiple pages (real guides commonly
// carry 50+ animals and overflow to a second page) — this is the one part
// of the layout where two separate drawText calls land on the same y and
// must be reconstructed into one line by reconstructLines.
export async function buildSnigGuideFixturePdf(input: SnigGuideFixtureInput): Promise<ArrayBuffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  let page = pdfDoc.addPage(PAGE_SIZE);
  let y = TOP_Y;

  function drawLine(text: string, x = LEFT_MARGIN) {
    page.drawText(text, { x, y, size: 10, font });
  }

  function newPageIfNeeded() {
    if (y < BOTTOM_MARGIN) {
      page = pdfDoc.addPage(PAGE_SIZE);
      y = TOP_Y;
    }
  }

  drawLine(`FECHA: ${input.eventDateDisplay}`);
  y -= LINE_HEIGHT;
  drawLine(`CORRESPONDE A LA GUÍA DE PROPIEDAD Y TRÁNSITO: ${input.guideNumber}`);
  y -= LINE_HEIGHT;
  drawLine(`DICOSE A: ${input.dicoseA} ${OWNER_NAME}`);
  y -= LINE_HEIGHT;
  drawLine(`DICOSE B: ${input.dicoseB} ${OWNER_NAME}`);
  y -= LINE_HEIGHT;
  drawLine(`DICOSE C: ${input.dicoseC} ${OWNER_NAME}`);
  y -= LINE_HEIGHT;
  drawLine(`DICOSE D: ${input.dicoseD} ${OWNER_NAME}`);
  y -= LINE_HEIGHT * 2;
  drawLine("NÚMEROS DE CARAVANAS:");
  y -= LINE_HEIGHT;

  for (let i = 0; i < input.animals.length; i += 2) {
    newPageIfNeeded();
    const first = input.animals[i];
    drawLine(`${i + 1}) ${first.tag} ${first.sex} ${first.ageMonths}`, LEFT_MARGIN);
    const second = input.animals[i + 1];
    if (second) {
      drawLine(`${i + 2}) ${second.tag} ${second.sex} ${second.ageMonths}`, RIGHT_COLUMN_X);
    }
    y -= LINE_HEIGHT;
  }

  const bytes = await pdfDoc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
```

- [ ] **Step 3: Write the failing extraction test**

Create `web/__tests__/lib/activities/pdf-text-extraction.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractPositionedTextItems, reconstructLines } from "@/lib/activities/pdf-text-extraction";
import { buildSnigGuideFixturePdf } from "../../../test/snig-guide-fixture";

async function buildSampleBuffer() {
  return buildSnigGuideFixturePdf({
    guideNumber: "D838153",
    eventDateDisplay: "11/07/2026",
    dicoseA: "151400442",
    dicoseB: "151518192",
    dicoseC: "151400442",
    dicoseD: "151518192",
    animals: [
      { tag: "858000031330866", sex: "H", ageMonths: 127 },
      { tag: "858000043150148", sex: "H", ageMonths: 90 },
      { tag: "858000043150118", sex: "H", ageMonths: 90 },
    ],
  });
}

describe("extractPositionedTextItems", () => {
  it("extracts every text run with page and position", async () => {
    const items = await extractPositionedTextItems(await buildSampleBuffer());

    expect(items.some((i) => i.text.includes("D838153"))).toBe(true);
    expect(items.every((i) => i.page === 1)).toBe(true);
    expect(items.every((i) => typeof i.x === "number" && typeof i.y === "number")).toBe(true);
  });
});

describe("reconstructLines", () => {
  it("joins same-line, same-page items left to right into one line", async () => {
    const items = await extractPositionedTextItems(await buildSampleBuffer());
    const lines = reconstructLines(items);

    expect(lines.some((l) => l.includes("FECHA: 11/07/2026"))).toBe(true);
    expect(lines.some((l) => l.includes("DICOSE C: 151400442"))).toBe(true);
  });

  it("reconstructs a two-column animal-list line as a single line containing both entries", async () => {
    const items = await extractPositionedTextItems(await buildSampleBuffer());
    const lines = reconstructLines(items);

    const firstAnimalLine = lines.find((l) => l.includes("858000031330866"));
    expect(firstAnimalLine).toBeDefined();
    expect(firstAnimalLine).toContain("858000043150148");
  });

  it("orders lines top to bottom, matching the order they were drawn", async () => {
    const items = await extractPositionedTextItems(await buildSampleBuffer());
    const lines = reconstructLines(items);

    const fechaIndex = lines.findIndex((l) => l.includes("FECHA:"));
    const dicoseCIndex = lines.findIndex((l) => l.includes("DICOSE C:"));
    expect(fechaIndex).toBeGreaterThanOrEqual(0);
    expect(dicoseCIndex).toBeGreaterThan(fechaIndex);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -- pdf-text-extraction`
Expected: FAIL — `lib/activities/pdf-text-extraction.ts` doesn't exist yet.

- [ ] **Step 5: Implement the extraction module**

Create `web/lib/activities/pdf-text-extraction.ts`:

```ts
// pdfjs-dist's legacy Node build runs without a browser worker, which is
// what makes text extraction usable directly from a server action.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export type PositionedTextItem = { page: number; x: number; y: number; text: string };

export async function extractPositionedTextItems(buffer: ArrayBuffer): Promise<PositionedTextItem[]> {
  const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;
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
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- pdf-text-extraction`
Expected: PASS.

- [ ] **Step 7: Manual verification against the real sample PDF (not automated, not committed)**

The spec requires validating this approach against a real guide before building the rest of the parser on top of it. Run a throwaway check (do not commit any script or the PDF itself):

```bash
cd web
node -e "
const { extractPositionedTextItems, reconstructLines } = require('./lib/activities/pdf-text-extraction.ts');
" 2>/dev/null || true
```

Since the module is TypeScript/ESM, instead write a temporary `.mjs` scratch file (outside the repo, e.g. in `/tmp`) that imports `tsx`'s runtime or compiles inline, reads `/Users/salvadorpanissa/Downloads/D838153.pdf` via `fs.readFileSync`, calls `extractPositionedTextItems` then `reconstructLines`, and logs the resulting lines. Confirm:
- The `FECHA:`, `DICOSE A/B/C/D:`, and `CORRESPONDE A LA GUÍA...` lines each come back as a single reconstructed line with label and value together (not split across separate lines).
- The two-column animal list lines reconstruct as `N) tag H|M age` pairs on one line, matching the fixture's shape.
- Page 2's continuation of the animal list is present in the extraction (not dropped).

If the real PDF's output differs from the fixture's in any way that would break the regexes planned for Task 2 (e.g., diacritics extracted differently, unexpected extra whitespace, a different label wording), note the exact difference in your task report — Task 2 must account for it. If everything matches, note that too. Delete the temporary script when done; do not commit it or the PDF.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json lib/activities/pdf-text-extraction.ts test/snig-guide-fixture.ts __tests__/lib/activities/pdf-text-extraction.test.ts
git commit -m "feat: add PDF positioned-text extraction and a synthetic SNIG guide fixture builder"
```

---

### Task 2: `parseSnigGuide`

**Files:**
- Create: `web/lib/activities/snig-guide-parsing.ts`
- Create: `web/__tests__/lib/activities/snig-guide-parsing.test.ts`

**Interfaces:**
- Consumes: `extractPositionedTextItems`, `reconstructLines` from `@/lib/activities/pdf-text-extraction` (Task 1); `normalizeDate` from `@/lib/activities/date-normalization` (pre-existing); `buildSnigGuideFixturePdf` from `../../../test/snig-guide-fixture` (Task 1, test-only).
- Produces: `parseSnigGuide(buffer: ArrayBuffer): Promise<SnigGuide>` where:
  ```ts
  export type SnigGuide = {
    guideNumber: string;
    eventDate: string; // ISO yyyy-mm-dd
    originDicoseCode: string;
    destinationDicoseCode: string;
    animals: { tag: string; sex: string | null; ageMonths: number | null }[];
  };
  ```
  `animals[].sex` is the **raw captured letter** ("H"/"M"), not yet normalized to `"male"/"female"` — normalization happens once, downstream, inside `resolveBatchRows` (Task 6), matching how every other row source in this codebase already works. Do not call `normalizeSex` inside this module.

- [ ] **Step 1: Write the failing tests**

Create `web/__tests__/lib/activities/snig-guide-parsing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseSnigGuide } from "@/lib/activities/snig-guide-parsing";
import { buildSnigGuideFixturePdf } from "../../../test/snig-guide-fixture";

const SAMPLE_INPUT = {
  guideNumber: "D838153",
  eventDateDisplay: "11/07/2026",
  dicoseA: "151400442",
  dicoseB: "151518192",
  dicoseC: "151400442",
  dicoseD: "151518192",
  animals: [
    { tag: "858000031330866", sex: "H" as const, ageMonths: 127 },
    { tag: "858000043150148", sex: "H" as const, ageMonths: 90 },
    { tag: "858000043150118", sex: "M" as const, ageMonths: 90 },
  ],
};

describe("parseSnigGuide", () => {
  it("extracts guide number, date, origin/destination DICOSE, and every animal", async () => {
    const buffer = await buildSnigGuideFixturePdf(SAMPLE_INPUT);

    const guide = await parseSnigGuide(buffer);

    expect(guide).toEqual({
      guideNumber: "D838153",
      eventDate: "2026-07-11",
      originDicoseCode: "151400442",
      destinationDicoseCode: "151518192",
      animals: [
        { tag: "858000031330866", sex: "H", ageMonths: 127 },
        { tag: "858000043150148", sex: "H", ageMonths: 90 },
        { tag: "858000043150118", sex: "M", ageMonths: 90 },
      ],
    });
  });

  it("handles an animal list that spans multiple pages", async () => {
    const manyAnimals = Array.from({ length: 70 }, (_, i) => ({
      tag: `85800005${String(i).padStart(7, "0")}`,
      sex: i % 2 === 0 ? ("H" as const) : ("M" as const),
      ageMonths: 40,
    }));
    const buffer = await buildSnigGuideFixturePdf({ ...SAMPLE_INPUT, animals: manyAnimals });

    const guide = await parseSnigGuide(buffer);

    expect(guide.animals).toHaveLength(70);
    expect(guide.animals[69].tag).toBe(manyAnimals[69].tag);
  });

  it("throws when the guide number is missing", async () => {
    const buffer = await buildSnigGuideFixturePdf({ ...SAMPLE_INPUT, guideNumber: "" });
    // An empty guideNumber still draws the label with nothing after it,
    // which the regex requires at least one non-space character to match —
    // confirms the "required field missing" path, not a crash.
    await expect(parseSnigGuide(buffer)).rejects.toThrow("número de guía");
  });

  it("throws when there are no animals", async () => {
    const buffer = await buildSnigGuideFixturePdf({ ...SAMPLE_INPUT, animals: [] });
    await expect(parseSnigGuide(buffer)).rejects.toThrow("caravanas");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- snig-guide-parsing`
Expected: FAIL — `lib/activities/snig-guide-parsing.ts` doesn't exist yet.

- [ ] **Step 3: Implement**

Create `web/lib/activities/snig-guide-parsing.ts`:

```ts
import { extractPositionedTextItems, reconstructLines } from "@/lib/activities/pdf-text-extraction";
import { normalizeDate } from "@/lib/activities/date-normalization";

export type SnigGuide = {
  guideNumber: string;
  eventDate: string;
  originDicoseCode: string;
  destinationDicoseCode: string;
  animals: { tag: string; sex: string | null; ageMonths: number | null }[];
};

const GUIDE_NUMBER_RE = /CORRESPONDE A LA GU[IÍ]A DE PROPIEDAD Y TR[AÁ]NSITO:\s*(\S+)/i;
const DATE_RE = /FECHA:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i;
const DICOSE_C_RE = /DICOSE C:\s*(\S+)/i;
const DICOSE_D_RE = /DICOSE D:\s*(\S+)/i;
const ANIMAL_ENTRY_RE = /\d+\)\s+(\S+)\s+([HM])\s+(\d+)/g;

export async function parseSnigGuide(buffer: ArrayBuffer): Promise<SnigGuide> {
  const items = await extractPositionedTextItems(buffer);
  const fullText = reconstructLines(items).join("\n");

  const guideNumberMatch = GUIDE_NUMBER_RE.exec(fullText);
  if (!guideNumberMatch) throw new Error("No se encontró el número de guía en el PDF");

  const dateMatch = DATE_RE.exec(fullText);
  if (!dateMatch) throw new Error("No se encontró la fecha en el PDF");
  const eventDate = normalizeDate(dateMatch[1]);
  if (!eventDate) throw new Error("La fecha del PDF tiene un formato no reconocido");

  const originMatch = DICOSE_C_RE.exec(fullText);
  if (!originMatch) throw new Error("No se encontró el DICOSE C (origen) en el PDF");

  const destinationMatch = DICOSE_D_RE.exec(fullText);
  if (!destinationMatch) throw new Error("No se encontró el DICOSE D (destino) en el PDF");

  const animals: SnigGuide["animals"] = [];
  for (const match of fullText.matchAll(ANIMAL_ENTRY_RE)) {
    const [, tag, sexLetter, ageStr] = match;
    animals.push({ tag, sex: sexLetter, ageMonths: Number(ageStr) });
  }
  if (animals.length === 0) throw new Error("No se encontraron caravanas en el PDF");

  return {
    guideNumber: guideNumberMatch[1],
    eventDate,
    originDicoseCode: originMatch[1],
    destinationDicoseCode: destinationMatch[1],
    animals,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- snig-guide-parsing`
Expected: PASS.

- [ ] **Step 5: Manual verification against the real sample PDF**

Repeat the manual check from Task 1 Step 7, this time calling `parseSnigGuide` directly against `/Users/salvadorpanissa/Downloads/D838153.pdf`, and confirm the returned `SnigGuide` has `guideNumber: "D838153"`, `eventDate: "2026-07-11"`, `originDicoseCode: "151400442"`, `destinationDicoseCode: "151518192"`, and 64 animals. If any regex needs adjusting to match the real extraction (e.g. different accent handling), fix it now and re-run both this task's tests and the manual check. Note the outcome in your task report. Do not commit the real PDF or any script that embeds its content.

- [ ] **Step 6: Commit**

```bash
git add lib/activities/snig-guide-parsing.ts __tests__/lib/activities/snig-guide-parsing.test.ts
git commit -m "feat: add parseSnigGuide"
```

---

### Task 3: DICOSE → farm lookup

**Files:**
- Modify: `web/lib/dal/dicose-registration.ts`
- Modify: `web/__tests__/dal/dicose-registration.test.ts`

**Interfaces:**
- Produces: `findFarmByDicoseCode(dicoseCode: string): Promise<{ farmId: string; farmName: string } | null>`.

- [ ] **Step 1: Write the failing test**

Add to `web/__tests__/dal/dicose-registration.test.ts` (append; keep existing tests and imports, extending the destructured import to include `findFarmByDicoseCode`):

```ts
describe("findFarmByDicoseCode", () => {
  it("resolves a registered DICOSE code to its farm", async () => {
    const [seededOwner] = await testDb.insert(owner).values({ name: "AIP" }).returning();
    const [seededFarm] = await testDb.insert(farm).values({ name: "Cuatro Cerros" }).returning();
    await testDb
      .insert(dicoseRegistration)
      .values({ ownerId: seededOwner.id, farmId: seededFarm.id, dicoseCode: "151518192" });

    const result = await findFarmByDicoseCode("151518192");

    expect(result).toEqual({ farmId: seededFarm.id, farmName: "Cuatro Cerros" });
  });

  it("returns null for a DICOSE code with no registration", async () => {
    expect(await findFarmByDicoseCode("000000000")).toBeNull();
  });
});
```

(If the existing file's top-of-file destructured import is `const { listDicoseRegistrations, createDicoseRegistration } = await import("@/lib/dal/dicose-registration");` or similar, add `findFarmByDicoseCode` to it. If `owner`/`farm`/`dicoseRegistration` aren't already imported from `@/db/schema` at the top of the file, add them.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- dicose-registration`
Expected: FAIL — `findFarmByDicoseCode` is not exported.

- [ ] **Step 3: Implement**

Add to `web/lib/dal/dicose-registration.ts` (the file already imports `eq` from `drizzle-orm`, `db` from `@/db`, and `dicoseRegistration, farm, owner` from `@/db/schema` — reuse those):

```ts
export async function findFarmByDicoseCode(dicoseCode: string): Promise<{ farmId: string; farmName: string } | null> {
  const [match] = await db
    .select({ farmId: dicoseRegistration.farmId, farmName: farm.name })
    .from(dicoseRegistration)
    .innerJoin(farm, eq(farm.id, dicoseRegistration.farmId))
    .where(eq(dicoseRegistration.dicoseCode, dicoseCode));
  return match ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- dicose-registration`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dal/dicose-registration.ts __tests__/dal/dicose-registration.test.ts
git commit -m "feat: add findFarmByDicoseCode"
```

---

### Task 4: Age → estimated birth date, and wiring it through `resolveBatchRows`

**Files:**
- Modify: `web/lib/activities/date-normalization.ts`
- Modify: `web/lib/activities/column-mapping.ts`
- Modify: `web/lib/activities/batch-resolution.ts`
- Modify: `web/__tests__/lib/activities/date-normalization.test.ts`
- Modify: `web/__tests__/lib/activities/batch-resolution.test.ts`

**Interfaces:**
- Produces: `estimateBirthDateFromAge(eventDateIso: string, ageMonths: number): string` in `date-normalization.ts`.
- Modifies: `MappedRow` (in `column-mapping.ts`) gains an **optional** `birthDate?: string | null` field. `applyColumnMapping` is NOT changed — it never sets this field, so its existing tests and behavior (Excel/health path) are unaffected; a `MappedRow` built with `applyColumnMapping` simply has `birthDate: undefined`, which `resolveBatchRows` treats as `null`.
- Modifies: `resolveBatchRows` (in `batch-resolution.ts`) uses `row.birthDate ?? null` instead of a hardcoded `null` for the `birthDate` it puts on `"new"`/`"wrong_farm"`/`"foreign"` rows.

- [ ] **Step 1: Write the failing tests**

Add to `web/__tests__/lib/activities/date-normalization.test.ts` (append; keep existing tests, add `estimateBirthDateFromAge` to the existing import from `@/lib/activities/date-normalization`):

```ts
describe("estimateBirthDateFromAge", () => {
  it("subtracts whole months and approximates to the 1st of the resulting month", () => {
    expect(estimateBirthDateFromAge("2026-07-11", 90)).toBe("2019-01-01");
  });

  it("handles an age of 0 months as born the same month", () => {
    expect(estimateBirthDateFromAge("2026-07-11", 0)).toBe("2026-07-01");
  });

  it("crosses a year boundary correctly", () => {
    expect(estimateBirthDateFromAge("2026-01-11", 2)).toBe("2025-11-01");
  });
});
```

Add to `web/__tests__/lib/activities/batch-resolution.test.ts` — find the existing test(s) that build a `MappedRow` resolving to `status: "new"` (search the file for `status: "new"` in an expectation, or a `resolveBatchRows` call whose input row has no `own_tag` match at the operating farm) and add one new test near them:

```ts
it("uses the row's birthDate when provided, for a new animal", async () => {
  const { seededFarm, user } = await seedFarmUserRole();
  const [seededOwner] = await testDb.insert(owner).values({ name: "AIP" }).returning();
  const [registration] = await testDb
    .insert(dicoseRegistration)
    .values({ ownerId: seededOwner.id, farmId: seededFarm.id, dicoseCode: "151400442" })
    .returning();
  await testDb.insert(ownTag).values({ tag: "AR000000000099", dicoseRegistrationId: registration.id });

  const rows: MappedRow[] = [
    {
      tag: "AR000000000099",
      date: "2026-07-11",
      category: null,
      sex: "H",
      ownerName: null,
      notes: null,
      birthDate: "2019-01-01",
    },
  ];

  const [resolved] = await resolveBatchRows(rows, null, seededFarm.id);

  expect(resolved.status).toBe("new");
  if (resolved.status === "new") {
    expect(resolved.birthDate).toBe("2019-01-01");
  }
});
```

(Adapt `seedFarmUserRole`/`owner`/`dicoseRegistration`/`ownTag` to whatever helper names and imports the existing file already uses — it already seeds equivalent data for its other `"new"`-status tests; mirror that pattern exactly rather than introducing a new one. `user` may be unused in this new test if the existing pattern doesn't need it for `resolveBatchRows` itself — remove it from the destructure if so.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- date-normalization batch-resolution`
Expected: FAIL — `estimateBirthDateFromAge` not exported; the new batch-resolution test's `resolved.birthDate` is `null` instead of `"2019-01-01"`.

- [ ] **Step 3: Implement**

Add to `web/lib/activities/date-normalization.ts`:

```ts
// Approximates a birth date from an age given in whole months, anchored to
// an event date — used for animals whose only age information is "N months
// old" (e.g. a SNIG guide), the same precision convention MONTH_YEAR_DATE
// already uses above: exact day unknown, approximate to the 1st.
export function estimateBirthDateFromAge(eventDateIso: string, ageMonths: number): string {
  const [year, month] = eventDateIso.split("-").map(Number);
  const totalMonths = year * 12 + (month - 1) - ageMonths;
  const resultYear = Math.floor(totalMonths / 12);
  const resultMonth = totalMonths % 12;
  return `${resultYear}-${String(resultMonth + 1).padStart(2, "0")}-01`;
}
```

In `web/lib/activities/column-mapping.ts`, add `birthDate?: string | null;` to the `MappedRow` type, right after `notes: string | null;`:

```ts
export type MappedRow = {
  tag: string;
  date: string | null;
  category: string | null;
  sex: string | null;
  ownerName: string | null;
  notes: string | null;
  birthDate?: string | null;
};
```

In `web/lib/activities/batch-resolution.ts`, find this block (around line 145-149):

```ts
    // own_tag is a pure ownership registry now (no sex/category/birth date) —
    // this batch's own columns are the only source for those fields.
    const ownTagMatch = ownTagByTag.get(row.tag);
    const sex = normalizeSex(row.sex);
    const birthDate: string | null = null;
```

Replace the last line with:

```ts
    const birthDate: string | null = row.birthDate ?? null;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- date-normalization batch-resolution`
Expected: PASS. Also run `npm test -- column-mapping` to confirm the existing `applyColumnMapping` tests still pass unmodified (they should — `birthDate` is optional and `applyColumnMapping` never sets it).

- [ ] **Step 5: Commit**

```bash
git add lib/activities/date-normalization.ts lib/activities/column-mapping.ts lib/activities/batch-resolution.ts __tests__/lib/activities/date-normalization.test.ts __tests__/lib/activities/batch-resolution.test.ts
git commit -m "feat: wire an optional birthDate through MappedRow/resolveBatchRows, add estimateBirthDateFromAge"
```

---

### Task 5: `confirmTransferBatch` — explicit origin farm and guide number

**Files:**
- Modify: `web/lib/activities/transfer.ts`
- Modify: `web/__tests__/lib/activities/transfer-confirm.test.ts`

**Interfaces:**
- Modifies: `confirmTransferBatch`'s input gains two **optional** fields: `originFarmId?: string` and `guideNumber?: string | null`. When `originFarmId` is omitted, behavior is byte-for-byte identical to today (new-animal rows get `originFarmId = operatingFarmId`, exactly as now) — every existing call site (`app/(protected)/activities/transfer/actions.ts`'s `confirmTransferBatchAction`, and every existing test) keeps compiling and passing unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `web/__tests__/lib/activities/transfer-confirm.test.ts` (append; the file already has `seedManagerAndFarm` and imports `eventTransfer` — reuse both):

```ts
it("uses an explicit originFarmId for a new animal instead of operatingFarmId, when provided", async () => {
  const { manager } = await seedManagerAndFarm();
  const [originFarm] = await testDb.insert(farm).values({ name: "Cuatro Cerros" }).returning();
  const [destinationFarm] = await testDb.insert(farm).values({ name: "Campo Norte 2" }).returning();

  const rows: ResolvedRow[] = [
    {
      tag: "AR000000000011",
      eventDate: "2026-02-01",
      notes: null,
      status: "new",
      categoryId: null,
      sex: null,
      birthDate: null,
      ownerId: null,
      pendingOwnerName: null,
    },
  ];

  await confirmTransferBatch({
    userId: manager.id,
    role: "admin",
    operatingFarmId: destinationFarm.id,
    destinationFarmId: destinationFarm.id,
    destinationPaddockId: null,
    originFarmId: originFarm.id,
    guideNumber: "D838153",
    rows,
  });

  const [createdEventTransfer] = await testDb.select().from(eventTransfer);
  expect(createdEventTransfer.originFarmId).toBe(originFarm.id);
  expect(createdEventTransfer.destinationFarmId).toBe(destinationFarm.id);
  expect(createdEventTransfer.guideNumber).toBe("D838153");
});

it("requires admin when the explicit originFarmId differs from destinationFarmId", async () => {
  const { manager } = await seedManagerAndFarm();
  const [originFarm] = await testDb.insert(farm).values({ name: "Cuatro Cerros" }).returning();
  const [destinationFarm] = await testDb.insert(farm).values({ name: "Campo Norte 2" }).returning();

  const rows: ResolvedRow[] = [
    {
      tag: "AR000000000012",
      eventDate: "2026-02-01",
      notes: null,
      status: "new",
      categoryId: null,
      sex: null,
      birthDate: null,
      ownerId: null,
      pendingOwnerName: null,
    },
  ];

  await expect(
    confirmTransferBatch({
      userId: manager.id,
      role: "manager",
      operatingFarmId: destinationFarm.id,
      destinationFarmId: destinationFarm.id,
      destinationPaddockId: null,
      originFarmId: originFarm.id,
      rows,
    })
  ).rejects.toThrow("Solo un admin puede crear un traslado entre campos distintos");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- transfer-confirm`
Expected: FAIL — `confirmTransferBatch`'s input type doesn't accept `originFarmId`/`guideNumber`, and behavior doesn't use them.

- [ ] **Step 3: Implement**

In `web/lib/activities/transfer.ts`, replace the function signature and body's top:

```ts
export async function confirmTransferBatch(input: {
  userId: string;
  role: string | undefined;
  operatingFarmId: string;
  destinationFarmId: string;
  destinationPaddockId: string | null;
  originFarmId?: string;
  guideNumber?: string | null;
  rows: ResolvedRow[];
}): Promise<void> {
  const { userId, role, operatingFarmId, destinationFarmId, destinationPaddockId, rows } = input;
  const newAnimalOriginFarmId = input.originFarmId ?? operatingFarmId;

  await requireFarmAccess(userId, role, operatingFarmId);
  requireTransferAuthorization(role, newAnimalOriginFarmId, destinationFarmId);
```

(This replaces the existing `await requireFarmAccess(...)` and `requireTransferAuthorization(role, operatingFarmId, destinationFarmId)` lines — note the second argument to `requireTransferAuthorization` changes from `operatingFarmId` to `newAnimalOriginFarmId`. For every existing caller, `newAnimalOriginFarmId === operatingFarmId`, so this is a no-op change for them.)

Further down, inside the `for (const row of rows)` loop, in the `else` branch (new/foreign/wrong_farm rows):

```ts
      } else {
        animalId = await createNewAnimal(tx, {
          userId,
          operatingFarmId,
          batchId: batch.id,
          row,
        });
        originFarmId = newAnimalOriginFarmId;
        originPaddockId = null;
      }
```

(Only the `originFarmId = operatingFarmId;` line changes, to `originFarmId = newAnimalOriginFarmId;`.)

And in the `eventTransfer` insert:

```ts
      await tx.insert(eventTransfer).values({
        eventId: createdEvent.id,
        originFarmId,
        destinationFarmId,
        originPaddockId,
        destinationPaddockId,
        guideNumber: input.guideNumber ?? null,
      });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- transfer-confirm`
Expected: PASS. Also run `npm test -- transfer-actions` to confirm the existing Excel-path action tests still pass unmodified.

- [ ] **Step 5: Commit**

```bash
git add lib/activities/transfer.ts __tests__/lib/activities/transfer-confirm.test.ts
git commit -m "feat: let confirmTransferBatch take an explicit origin farm and guide number"
```

---

### Task 6: Server actions — preview and confirm from a PDF

**Files:**
- Modify: `web/app/(protected)/activities/transfer/actions.ts`
- Create: `web/__tests__/activities/transfer-pdf-actions.test.ts`

**Interfaces:**
- Consumes: `parseSnigGuide` (Task 2), `findFarmByDicoseCode` (Task 3), `estimateBirthDateFromAge` (Task 4), `confirmTransferBatch`'s new `originFarmId`/`guideNumber` inputs (Task 5), `buildSnigGuideFixturePdf` (Task 1, test-only).
- Produces:
  ```ts
  export type PdfPreviewResult =
    | { ok: false; error: string }
    | {
        ok: true;
        guideNumber: string;
        eventDate: string;
        originFarmId: string;
        originFarmName: string;
        destinationFarmId: string;
        destinationFarmName: string;
        rows: ResolvedRow[];
      };

  export async function previewTransferBatchFromPdf(formData: FormData): Promise<PdfPreviewResult>;

  export async function confirmTransferBatchFromPdfAction(input: {
    originFarmId: string;
    destinationFarmId: string;
    destinationPaddockId: string | null;
    guideNumber: string;
    rows: ResolvedRow[];
  }): Promise<void>;
  ```

- [ ] **Step 1: Write the failing integration tests**

Create `web/__tests__/activities/transfer-pdf-actions.test.ts`. This hits the real actions against the real test DB (mocking only `@/db` and `@/auth`, the same pattern `__tests__/activities/health-actions.test.ts` and `__tests__/activities/transfer-actions.test.ts` already use for this repo's other real-DB action tests) — it is the only place in this feature that proves the full parse → resolve DICOSE → resolveBatchRows → confirm chain actually works end to end, not mocked at any layer:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { buildSnigGuideFixturePdf } from "../../test/snig-guide-fixture";
import { role, farm, userAccount, owner, dicoseRegistration, ownTag, eventTransfer, animal } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { auth } = await import("@/auth");
const { previewTransferBatchFromPdf, confirmTransferBatchFromPdfAction } = await import(
  "@/app/(protected)/activities/transfer/actions"
);

beforeEach(async () => {
  await resetTestDb();
});

async function seedAdminSession() {
  const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
  const [user] = await testDb
    .insert(userAccount)
    .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
    .returning();
  vi.mocked(auth).mockResolvedValue({ user: { id: user.id, role: "admin" } } as never);
  return user;
}

function pdfFormData(buffer: ArrayBuffer): FormData {
  const formData = new FormData();
  formData.set("file", new File([buffer], "guide.pdf", { type: "application/pdf" }));
  return formData;
}

describe("previewTransferBatchFromPdf", () => {
  it("resolves origin/destination farms from DICOSE and returns the parsed rows", async () => {
    await seedAdminSession();
    const [seededOwner] = await testDb.insert(owner).values({ name: "AIP" }).returning();
    const [originFarm] = await testDb.insert(farm).values({ name: "Campo San Antonio" }).returning();
    const [destinationFarm] = await testDb.insert(farm).values({ name: "Cuatro Cerros" }).returning();
    const [originRegistration] = await testDb
      .insert(dicoseRegistration)
      .values({ ownerId: seededOwner.id, farmId: originFarm.id, dicoseCode: "151400442" })
      .returning();
    const [destinationRegistration] = await testDb
      .insert(dicoseRegistration)
      .values({ ownerId: seededOwner.id, farmId: destinationFarm.id, dicoseCode: "151518192" })
      .returning();
    await testDb
      .insert(ownTag)
      .values({ tag: "858000031330866", dicoseRegistrationId: destinationRegistration.id });

    const buffer = await buildSnigGuideFixturePdf({
      guideNumber: "D838153",
      eventDateDisplay: "11/07/2026",
      dicoseA: "151400442",
      dicoseB: "151518192",
      dicoseC: "151400442",
      dicoseD: "151518192",
      animals: [{ tag: "858000031330866", sex: "H", ageMonths: 90 }],
    });

    const result = await previewTransferBatchFromPdf(pdfFormData(buffer));

    expect(result).toEqual({
      ok: true,
      guideNumber: "D838153",
      eventDate: "2026-07-11",
      originFarmId: originFarm.id,
      originFarmName: "Campo San Antonio",
      destinationFarmId: destinationFarm.id,
      destinationFarmName: "Cuatro Cerros",
      rows: [
        {
          tag: "858000031330866",
          eventDate: "2026-07-11",
          notes: null,
          status: "new",
          categoryId: null,
          sex: "female",
          birthDate: "2019-01-01",
          ownerId: seededOwner.id,
          pendingOwnerName: null,
        },
      ],
    });
    expect(originRegistration.farmId).toBe(originFarm.id); // sanity: the seeded fixture is coherent
  });

  it("returns a friendly error when a DICOSE code has no registered farm", async () => {
    await seedAdminSession();
    const buffer = await buildSnigGuideFixturePdf({
      guideNumber: "D838153",
      eventDateDisplay: "11/07/2026",
      dicoseA: "151400442",
      dicoseB: "151518192",
      dicoseC: "999999999",
      dicoseD: "151518192",
      animals: [{ tag: "858000031330866", sex: "H", ageMonths: 90 }],
    });

    const result = await previewTransferBatchFromPdf(pdfFormData(buffer));

    expect(result).toEqual({ ok: false, error: "No hay ningún campo registrado con DICOSE 999999999" });
  });

  it("returns a friendly error when the PDF isn't a recognizable guide", async () => {
    await seedAdminSession();
    const notAGuide = new TextEncoder().encode("%PDF-1.4\nnot a real guide").buffer;

    const result = await previewTransferBatchFromPdf(pdfFormData(notAGuide));

    expect(result.ok).toBe(false);
  });
});

describe("confirmTransferBatchFromPdfAction", () => {
  it("confirms the batch with the explicit origin farm and guide number", async () => {
    await seedAdminSession();
    const [seededOwner] = await testDb.insert(owner).values({ name: "AIP" }).returning();
    const [originFarm] = await testDb.insert(farm).values({ name: "Campo San Antonio" }).returning();
    const [destinationFarm] = await testDb.insert(farm).values({ name: "Cuatro Cerros" }).returning();
    const [destinationRegistration] = await testDb
      .insert(dicoseRegistration)
      .values({ ownerId: seededOwner.id, farmId: destinationFarm.id, dicoseCode: "151518192" })
      .returning();
    await testDb
      .insert(ownTag)
      .values({ tag: "858000031330866", dicoseRegistrationId: destinationRegistration.id });

    await confirmTransferBatchFromPdfAction({
      originFarmId: originFarm.id,
      destinationFarmId: destinationFarm.id,
      destinationPaddockId: null,
      guideNumber: "D838153",
      rows: [
        {
          tag: "858000031330866",
          eventDate: "2026-07-11",
          notes: null,
          status: "new",
          categoryId: null,
          sex: "female",
          birthDate: "2019-01-01",
          ownerId: seededOwner.id,
          pendingOwnerName: null,
        },
      ],
    });

    const [createdEventTransfer] = await testDb.select().from(eventTransfer);
    expect(createdEventTransfer.originFarmId).toBe(originFarm.id);
    expect(createdEventTransfer.destinationFarmId).toBe(destinationFarm.id);
    expect(createdEventTransfer.guideNumber).toBe("D838153");
    const [createdAnimal] = await testDb.select().from(animal);
    expect(createdAnimal.birthDate).toBe("2019-01-01");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- transfer-pdf-actions`
Expected: FAIL — `previewTransferBatchFromPdf`/`confirmTransferBatchFromPdfAction` are not exported yet.

- [ ] **Step 3: Implement**

Add to `web/app/(protected)/activities/transfer/actions.ts` (the file already imports `requireSession`, `requireFarmAccess`, `resolveBatchRows`, `confirmTransferBatch`, `type ResolvedRow` — reuse those; add the new imports below):

```ts
import { parseSnigGuide } from "@/lib/activities/snig-guide-parsing";
import { findFarmByDicoseCode } from "@/lib/dal/dicose-registration";
import { estimateBirthDateFromAge } from "@/lib/activities/date-normalization";
import type { MappedRow } from "@/lib/activities/column-mapping";

export type PdfPreviewResult =
  | { ok: false; error: string }
  | {
      ok: true;
      guideNumber: string;
      eventDate: string;
      originFarmId: string;
      originFarmName: string;
      destinationFarmId: string;
      destinationFarmName: string;
      rows: ResolvedRow[];
    };

export async function previewTransferBatchFromPdf(formData: FormData): Promise<PdfPreviewResult> {
  const session = await requireSession();
  const file = formData.get("file") as File;
  const buffer = await file.arrayBuffer();

  let guide;
  try {
    guide = await parseSnigGuide(buffer);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo leer el PDF" };
  }

  const origin = await findFarmByDicoseCode(guide.originDicoseCode);
  if (!origin) {
    return { ok: false, error: `No hay ningún campo registrado con DICOSE ${guide.originDicoseCode}` };
  }
  const destination = await findFarmByDicoseCode(guide.destinationDicoseCode);
  if (!destination) {
    return { ok: false, error: `No hay ningún campo registrado con DICOSE ${guide.destinationDicoseCode}` };
  }

  await requireFarmAccess(session.user.id, session.user.role, destination.farmId);

  const mappedRows: MappedRow[] = guide.animals.map((a) => ({
    tag: a.tag,
    date: guide.eventDate,
    category: null,
    sex: a.sex,
    ownerName: null,
    notes: null,
    birthDate: a.ageMonths !== null ? estimateBirthDateFromAge(guide.eventDate, a.ageMonths) : null,
  }));

  const rows = await resolveBatchRows(mappedRows, guide.eventDate, destination.farmId);

  return {
    ok: true,
    guideNumber: guide.guideNumber,
    eventDate: guide.eventDate,
    originFarmId: origin.farmId,
    originFarmName: origin.farmName,
    destinationFarmId: destination.farmId,
    destinationFarmName: destination.farmName,
    rows,
  };
}

export async function confirmTransferBatchFromPdfAction(input: {
  originFarmId: string;
  destinationFarmId: string;
  destinationPaddockId: string | null;
  guideNumber: string;
  rows: ResolvedRow[];
}): Promise<void> {
  const session = await requireSession();
  await requireFarmAccess(session.user.id, session.user.role, input.destinationFarmId);

  await confirmTransferBatch({
    userId: session.user.id,
    role: session.user.role,
    operatingFarmId: input.destinationFarmId,
    destinationFarmId: input.destinationFarmId,
    destinationPaddockId: input.destinationPaddockId,
    originFarmId: input.originFarmId,
    guideNumber: input.guideNumber,
    rows: input.rows,
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- transfer-pdf-actions`
Expected: PASS. Then run the full suite once: `npm test`.

- [ ] **Step 5: Commit**

```bash
git add "app/(protected)/activities/transfer/actions.ts" __tests__/activities/transfer-pdf-actions.test.ts
git commit -m "feat: add previewTransferBatchFromPdf and confirmTransferBatchFromPdfAction"
```

---

### Task 7: UI — PDF upload mode on the Transfer page

**Files:**
- Modify: `web/lib/activities/transfer.ts` (export the shared `pendingOwnerNames` helper)
- Modify: `web/components/activities/transfer-form.tsx`
- Create: `web/components/activities/pdf-guide-transfer-form.tsx`
- Create: `web/__tests__/components/pdf-guide-transfer-form.test.tsx`
- Modify: `web/__tests__/components/transfer-form.test.tsx`

**Interfaces:**
- Consumes: `previewTransferBatchFromPdf`, `confirmTransferBatchFromPdfAction`, `createOwnerAction`, `listPaddocksAction`, `createPaddockAction` (all from `@/app/(protected)/activities/transfer/actions`, the last three already existing and reused as-is); `PendingOwnerEditor`, `PaddockSelector`, `TransferPreviewTable` (pre-existing, reused as-is); `pendingOwnerNames` (moved from `transfer-form.tsx` into `lib/activities/transfer.ts` in this task, exported, and imported by both forms).
- Produces: `PdfGuideTransferForm({ farms }: { farms: { id: string; name: string }[] })` client component.
- Modifies: `TransferForm` gains a two-way mode switch ("Excel" / "Guía SNIG (PDF)"); when the PDF mode is selected, it renders `<PdfGuideTransferForm farms={farms} />` instead of its existing Excel body. The existing Excel body's JSX and logic are otherwise **unchanged**.

- [ ] **Step 1: Move `pendingOwnerNames` into `lib/activities/transfer.ts`**

In `web/components/activities/transfer-form.tsx`, delete this function (it currently sits near the top of the file, right after the imports):

```ts
function pendingOwnerNames(rows: ResolvedRow[]): string[] {
  const names: string[] = [];
  for (const row of rows) {
    if (row.status === "new" && row.pendingOwnerName) names.push(row.pendingOwnerName);
    if (row.status === "foreign" && row.forced && row.pendingOwnerName) names.push(row.pendingOwnerName);
  }
  return Array.from(new Set(names));
}
```

Add the same function to `web/lib/activities/transfer.ts`, exported, placed after the `export { resolveBatchRows, type ResolvedRow };` line:

```ts
export function pendingOwnerNames(rows: ResolvedRow[]): string[] {
  const names: string[] = [];
  for (const row of rows) {
    if (row.status === "new" && row.pendingOwnerName) names.push(row.pendingOwnerName);
    if (row.status === "foreign" && row.forced && row.pendingOwnerName) names.push(row.pendingOwnerName);
  }
  return Array.from(new Set(names));
}
```

In `transfer-form.tsx`, change the import line that currently reads:

```ts
import type { ResolvedRow } from "@/lib/activities/transfer";
```

to:

```ts
import { pendingOwnerNames, type ResolvedRow } from "@/lib/activities/transfer";
```

Run `npm test -- transfer-form transfer-confirm` — expect the existing tests to still pass (pure relocation, no behavior change).

- [ ] **Step 2: Write the failing component test for `PdfGuideTransferForm`**

Create `web/__tests__/components/pdf-guide-transfer-form.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PdfGuideTransferForm } from "@/components/activities/pdf-guide-transfer-form";
import {
  previewTransferBatchFromPdf,
  confirmTransferBatchFromPdfAction,
  listPaddocksAction,
} from "@/app/(protected)/activities/transfer/actions";

afterEach(cleanup);

vi.mock("@/app/(protected)/activities/transfer/actions", () => ({
  previewTransferBatchFromPdf: vi.fn(),
  confirmTransferBatchFromPdfAction: vi.fn(),
  createOwnerAction: vi.fn(),
  listPaddocksAction: vi.fn(),
  createPaddockAction: vi.fn(),
}));

function samplePdfFile(): File {
  return new File([new Uint8Array([1, 2, 3])], "guide.pdf", { type: "application/pdf" });
}

describe("PdfGuideTransferForm", () => {
  it("uploads a PDF, shows the resolved origin/destination/date/guide number, and confirms", async () => {
    vi.mocked(listPaddocksAction).mockResolvedValue([]);
    vi.mocked(previewTransferBatchFromPdf).mockResolvedValue({
      ok: true,
      guideNumber: "D838153",
      eventDate: "2026-07-11",
      originFarmId: "farm-origin",
      originFarmName: "Campo San Antonio",
      destinationFarmId: "farm-destination",
      destinationFarmName: "Cuatro Cerros",
      rows: [
        {
          tag: "858000031330866",
          eventDate: "2026-07-11",
          notes: null,
          status: "new",
          categoryId: null,
          sex: "female",
          birthDate: "2019-01-01",
          ownerId: "owner-1",
          pendingOwnerName: null,
        },
      ],
    });
    vi.mocked(confirmTransferBatchFromPdfAction).mockResolvedValue(undefined);

    render(<PdfGuideTransferForm farms={[]} />);

    const user = userEvent.setup();
    const fileInput = screen.getByLabelText("Archivo");
    await user.upload(fileInput, samplePdfFile());
    await user.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => expect(screen.getByText("Campo San Antonio")).toBeInTheDocument());
    expect(screen.getByText("Cuatro Cerros")).toBeInTheDocument();
    expect(screen.getByText("D838153")).toBeInTheDocument();
    expect(screen.getByText("858000031330866")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() =>
      expect(confirmTransferBatchFromPdfAction).toHaveBeenCalledWith({
        originFarmId: "farm-origin",
        destinationFarmId: "farm-destination",
        destinationPaddockId: null,
        guideNumber: "D838153",
        rows: expect.any(Array),
      })
    );
    expect(screen.getByText("Lote confirmado.")).toBeInTheDocument();
  });

  it("shows an inline error and no preview when the DICOSE lookup fails", async () => {
    vi.mocked(previewTransferBatchFromPdf).mockResolvedValue({
      ok: false,
      error: "No hay ningún campo registrado con DICOSE 999999999",
    });

    render(<PdfGuideTransferForm farms={[]} />);

    const user = userEvent.setup();
    await user.upload(screen.getByLabelText("Archivo"), samplePdfFile());
    await user.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() =>
      expect(screen.getByText("No hay ningún campo registrado con DICOSE 999999999")).toBeInTheDocument()
    );
    expect(screen.queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- pdf-guide-transfer-form`
Expected: FAIL — `@/components/activities/pdf-guide-transfer-form` doesn't exist yet.

- [ ] **Step 4: Implement `PdfGuideTransferForm`**

Create `web/components/activities/pdf-guide-transfer-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PendingOwnerEditor } from "@/components/activities/pending-owner-editor";
import { PaddockSelector } from "@/components/activities/paddock-selector";
import { TransferPreviewTable } from "@/components/activities/transfer-preview-table";
import {
  previewTransferBatchFromPdf,
  confirmTransferBatchFromPdfAction,
  createOwnerAction,
  listPaddocksAction,
  createPaddockAction,
  type PdfPreviewResult,
} from "@/app/(protected)/activities/transfer/actions";
import { pendingOwnerNames, type ResolvedRow } from "@/lib/activities/transfer";
import type { OwnerCatalogEntry } from "@/lib/dal/owner-catalog";
import type { PaddockCatalogEntry } from "@/lib/dal/paddock-catalog";

export function PdfGuideTransferForm({ farms: _farms }: { farms: { id: string; name: string }[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PdfPreviewResult | null>(null);
  const [rows, setRows] = useState<ResolvedRow[]>([]);
  const [paddocks, setPaddocks] = useState<PaddockCatalogEntry[]>([]);
  const [destinationPaddockId, setDestinationPaddockId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  async function handleUpload() {
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    const result = await previewTransferBatchFromPdf(formData);
    setPreview(result);
    if (result.ok) {
      setRows(result.rows);
      setPaddocks(await listPaddocksAction(result.destinationFarmId));
    }
  }

  async function handleCreatePaddock(name: string): Promise<PaddockCatalogEntry> {
    if (!preview?.ok) throw new Error("Subí una guía primero");
    const created = await createPaddockAction(preview.destinationFarmId, name);
    setPaddocks((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
  }

  async function handleCreateOwner(name: string): Promise<OwnerCatalogEntry> {
    return createOwnerAction(name);
  }

  function handleOwnerResolved(rawName: string, ownerId: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.status === "new" && r.pendingOwnerName === rawName) return { ...r, ownerId, pendingOwnerName: null };
        if (r.status === "foreign" && r.pendingOwnerName === rawName) return { ...r, ownerId, pendingOwnerName: null };
        return r;
      })
    );
  }

  function handleToggleForced(tag: string) {
    setRows((prev) => prev.map((r) => (r.status === "foreign" && r.tag === tag ? { ...r, forced: !r.forced } : r)));
  }

  async function handleConfirm() {
    if (!preview?.ok) return;
    await confirmTransferBatchFromPdfAction({
      originFarmId: preview.originFarmId,
      destinationFarmId: preview.destinationFarmId,
      destinationPaddockId,
      guideNumber: preview.guideNumber,
      rows,
    });
    setConfirmed(true);
  }

  if (confirmed) {
    return <p>Lote confirmado.</p>;
  }

  const pendingNames = pendingOwnerNames(rows);
  const hasConfirmableRow = rows.some(
    (r) =>
      r.status === "new" || r.status === "existing" || r.status === "wrong_farm" || (r.status === "foreign" && r.forced)
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="file">Archivo</Label>
        <Input
          id="file"
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
            setRows([]);
          }}
        />
      </div>
      <Button type="button" disabled={!file} onClick={handleUpload}>
        Subir
      </Button>

      {preview && !preview.ok ? <p className="text-sm text-destructive">{preview.error}</p> : null}

      {preview?.ok ? (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Guía</dt>
            <dd>{preview.guideNumber}</dd>
            <dt className="text-muted-foreground">Fecha</dt>
            <dd>{preview.eventDate}</dd>
            <dt className="text-muted-foreground">Campo origen</dt>
            <dd>{preview.originFarmName}</dd>
            <dt className="text-muted-foreground">Campo destino</dt>
            <dd>{preview.destinationFarmName}</dd>
          </dl>
          <PaddockSelector
            paddocks={paddocks}
            paddockId={destinationPaddockId}
            onChange={setDestinationPaddockId}
            onCreatePaddock={handleCreatePaddock}
          />
          <PendingOwnerEditor pendingNames={pendingNames} onCreateOwner={handleCreateOwner} onResolved={handleOwnerResolved} />
          <TransferPreviewTable rows={rows} onToggleForced={handleToggleForced} />
          <Button
            type="button"
            disabled={rows.some((r) => r.status === "error") || pendingNames.length > 0 || !hasConfirmableRow}
            onClick={handleConfirm}
          >
            Confirmar
          </Button>
        </div>
      ) : null}
    </div>
  );
}
```

(`farms` is accepted but unused today — kept for interface symmetry with `TransferForm` and because a future task may need it for a manual override; renamed to `_farms` to satisfy the lint rule for unused parameters without removing it from the public signature.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- pdf-guide-transfer-form`
Expected: PASS.

- [ ] **Step 6: Add the mode switch to `TransferForm`**

In `web/components/activities/transfer-form.tsx`, add an import:

```ts
import { PdfGuideTransferForm } from "@/components/activities/pdf-guide-transfer-form";
```

Add mode state near the top of the component body (alongside the other `useState` calls):

```ts
const [mode, setMode] = useState<"excel" | "pdf">("excel");
```

Wrap the returned JSX so the mode switch sits above whichever body renders. The existing `return (<div className="flex flex-col gap-4"> ... </div>)` becomes:

```tsx
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Button type="button" variant={mode === "excel" ? "default" : "outline"} onClick={() => setMode("excel")}>
          Excel
        </Button>
        <Button type="button" variant={mode === "pdf" ? "default" : "outline"} onClick={() => setMode("pdf")}>
          Guía SNIG (PDF)
        </Button>
      </div>
      {mode === "pdf" ? (
        <PdfGuideTransferForm farms={farms} />
      ) : (
        <div className="flex flex-col gap-4">
          {/* everything that was already inside the outer <div className="flex flex-col gap-4"> stays here, unchanged */}
        </div>
      )}
    </div>
  );
```

Concretely: take the existing body (from `<div className="flex flex-col gap-2"> <Label htmlFor="destinationFarm">...` through the closing of the confirm-preview block) and nest it one level deeper inside the new `mode === "pdf" ? ... : (...)` conditional, with no other changes to that JSX or to any of the functions above it (`handleDestinationFarmChange`, `runPreview`, `handleConfirm`, etc. all stay exactly as they are — they're simply not rendered when `mode === "pdf"`).

Also update `web/__tests__/components/transfer-form.test.tsx`: any existing test that renders `<TransferForm ... />` and immediately interacts with the Excel-specific fields (destination farm select, file input, etc.) needs no change if `mode` defaults to `"excel"` and those fields render unconditionally in that mode — verify this is still true after Step 6 by running the existing test file. If any assertion targets an element by a `role`/`name` that's now ambiguous because both modes render a `Label htmlFor="file"` and `Button` named "Subir" — it should not be, since only one mode's JSX is mounted at a time — but re-run and fix any resulting duplicate-match errors by confirming the inactive mode's tree is truly absent (conditional rendering, not `hidden`/`display:none`).

- [ ] **Step 7: Run the full component test suite for this area**

Run: `npm test -- transfer-form pdf-guide-transfer-form transfer-confirm transfer-pdf-actions`
Expected: PASS, all files.

- [ ] **Step 8: Commit**

```bash
git add lib/activities/transfer.ts components/activities/transfer-form.tsx components/activities/pdf-guide-transfer-form.tsx __tests__/components/pdf-guide-transfer-form.test.tsx __tests__/components/transfer-form.test.tsx
git commit -m "feat: add a PDF guide upload mode to the Transfer form"
```

---

### Task 8: E2E — upload a SNIG guide PDF and confirm a transfer

**Files:**
- Create: `web/e2e/snig-guide-transfer.spec.ts`

**Interfaces:**
- Consumes: the running app with Tasks 1–7 applied; the seeded admin user (`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`, same as other `e2e/*.spec.ts` files); `buildSnigGuideFixturePdf` (Task 1) to generate the uploaded file — the real sample PDF is never used in committed code.

- [ ] **Step 1: Write the E2E test**

Create `web/e2e/snig-guide-transfer.spec.ts`. This needs a DICOSE registration for both origin and destination pointing at farms that exist in the seeded test data — check `e2e/global-setup.ts` and `e2e/dicose-foreign-tag.spec.ts` for how an existing spec registers a DICOSE and farm via the UI (`/settings/dicose`) rather than seeding the DB directly, and follow that same convention so this spec is self-contained and order-independent like the others:

```ts
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSnigGuideFixturePdf } from "../test/snig-guide-fixture";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

test("uploads a SNIG guide PDF and confirms a transfer between two DICOSE-registered farms", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  // Register origin and destination DICOSE for the same owner, on two different farms.
  await page.goto("/settings/paddocks"); // no-op navigation to confirm session; real farm creation happens via /settings/dicose's farm dropdown, which only lists existing farms — this spec relies on "Campo Norte" already existing from db:seed, used as destination, and registers a second farm's DICOSE by reusing the same farm if only one exists in this environment (see note below).
  await page.goto("/settings/dicose");
  await page.getByLabel("Dueño").selectOption({ label: "Pérez" });
  await page.getByLabel("Campo", { exact: true }).selectOption({ label: "Campo Norte" });
  await page.getByLabel("Código DICOSE").fill("151400442");
  await page.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByText("151400442")).toBeVisible();

  await page.getByLabel("Dueño").selectOption({ label: "Pérez" });
  await page.getByLabel("Campo", { exact: true }).selectOption({ label: "Campo Norte" });
  await page.getByLabel("Código DICOSE").fill("151518192");
  await page.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByText("151518192")).toBeVisible();

  const buffer = await buildSnigGuideFixturePdf({
    guideNumber: "E2E-GUIDE-1",
    eventDateDisplay: "11/07/2026",
    dicoseA: "151400442",
    dicoseB: "151400442",
    dicoseC: "151400442",
    dicoseD: "151518192",
    animals: [{ tag: "900000000001", sex: "H", ageMonths: 24 }],
  });
  const pdfPath = path.join(os.tmpdir(), "snig-guide-e2e.pdf");
  fs.writeFileSync(pdfPath, Buffer.from(buffer));

  await page.goto("/activities/transfer");
  await page.getByRole("button", { name: "Guía SNIG (PDF)" }).click();
  await page.getByLabel("Archivo").setInputFiles(pdfPath);
  await page.getByRole("button", { name: "Subir" }).click();

  await expect(page.getByText("E2E-GUIDE-1")).toBeVisible();
  await expect(page.getByText("Campo Norte")).toBeVisible();
  await expect(page.getByText("900000000001")).toBeVisible();

  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("Lote confirmado.")).toBeVisible();
});
```

Note the DICOSE C/D reuse the same farm ("Campo Norte") in this spec because a fresh test-DB seed may only guarantee one farm exists (`db:seed`'s output is `Seeded: admin (admin@example.com), farm "Campo Norte"`, confirmed in Task 10's report from the prior feature branch). Registering two different `dicose_registration` rows against the **same** farm (different DICOSE codes, same `farmId`) still exercises the full origin/destination-resolution and confirm path — `originFarmId === destinationFarmId` in the resulting transfer, which `requireTransferAuthorization` allows for any role, so this doesn't require the logged-in test user to be admin either. If the local dev/test seed already provisions a second farm by the time this task runs, prefer registering DICOSE C/D against two distinct farms instead, to also exercise the cross-farm path — check `db/seed.ts` before writing this test and adjust accordingly; either version is an acceptable, complete E2E for this task as long as it proves the PDF upload → resolved preview → confirm chain works against the real running app.

- [ ] **Step 2: Run the E2E test**

Run: `npm run test:e2e -- e2e/snig-guide-transfer.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/snig-guide-transfer.spec.ts
git commit -m "test: add e2e coverage for uploading a SNIG guide PDF in Transfer"
```

---

## Self-Review Notes

- **Spec coverage:** PDF text extraction + risk validation (Task 1), `parseSnigGuide` (Task 2), DICOSE→farm resolution (Task 3), birthDate estimation + wiring (Task 4), explicit origin/guideNumber in confirm (Task 5), server actions with friendly-error results (Task 6), UI mode switch (Task 7), E2E (Task 8) — every section of the spec maps to a task.
- **Excel path untouched:** verified at the type level throughout — every change to shared code (`MappedRow`, `confirmTransferBatch`) is additive/optional, and each task explicitly re-runs the pre-existing Excel-path tests (`transfer-actions`, `transfer-form`, `column-mapping`) to confirm no regression.
- **Privacy:** the real sample PDF is never committed; Task 1's synthetic `pdf-lib` fixture is the only PDF committed to the repo (as generatable code, not a binary), used by every subsequent task's tests and by the E2E spec.
- **No placeholders:** Task 1's "manual verification" steps are the one deliberately open-ended part of this plan — this is the spec's own explicitly-approved risk (empirical validation against a real, non-committable file cannot be scripted into a repo-committed automated test), not a skipped requirement; every other step has complete, runnable code.
- **Type consistency verified:** `SnigGuide`, `PdfPreviewResult`, `MappedRow.birthDate`, and `confirmTransferBatch`'s new optional fields use matching names/types across Tasks 2, 4, 5, 6, and 7.
