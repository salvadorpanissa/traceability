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

  it("throws when DICOSE C is missing", async () => {
    const buffer = await buildSnigGuideFixturePdf({ ...SAMPLE_INPUT, dicoseC: "" });
    // An empty dicoseC still draws the label with nothing after it, which the
    // regex requires at least one digit after to match — confirms the
    // "required field missing" path rather than silently capturing the next
    // field's "DICOSE" label token as the value.
    await expect(parseSnigGuide(buffer)).rejects.toThrow("DICOSE C");
  });

  it("throws when there are no animals", async () => {
    const buffer = await buildSnigGuideFixturePdf({ ...SAMPLE_INPUT, animals: [] });
    await expect(parseSnigGuide(buffer)).rejects.toThrow("caravanas");
  });
});
