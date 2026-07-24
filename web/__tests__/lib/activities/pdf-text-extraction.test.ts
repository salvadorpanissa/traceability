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
