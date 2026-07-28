import { describe, expect, it } from "vitest";
import { parseCledinorSettlement } from "@/lib/activities/cledinor-settlement-parsing";
import { buildCledinorSettlementFixturePdf } from "../../../test/cledinor-settlement-fixture";

const SAMPLE_INPUT = {
  guideNumber: "D963691",
  weighDateDisplay: "11/07/2026",
  subTotal: "24.135,51",
  total: "23.396,21",
  categoryRows: ["VACA 18 9.300,00 516,67 2,5810 4.946,80 274,82 4,8522 4.599,30 255,52 5,2189 53,19 49,45 7,02"],
};

describe("parseCledinorSettlement", () => {
  it("extracts guide number, weigh date, total, and weight/price when there's exactly one category row", async () => {
    const buffer = await buildCledinorSettlementFixturePdf(SAMPLE_INPUT);

    const result = await parseCledinorSettlement(buffer);

    expect(result).toEqual({
      guideNumber: "D963691",
      weighDate: "2026-07-11",
      total: "23396.21",
      weightKg: "255.52",
      pricePerKg: "5.2189",
    });
  });

  it("does not pick up SUB TOTAL as the total", async () => {
    const buffer = await buildCledinorSettlementFixturePdf({ ...SAMPLE_INPUT, subTotal: "99.999,99" });

    const result = await parseCledinorSettlement(buffer);

    expect(result.total).toBe("23396.21");
  });

  it("returns null weight/price when there is more than one category row", async () => {
    const buffer = await buildCledinorSettlementFixturePdf({
      ...SAMPLE_INPUT,
      categoryRows: [
        "VACA 18 9.300,00 516,67 2,5810 4.946,80 274,82 4,8522 4.599,30 255,52 5,2189 53,19 49,45 7,02",
        "NOVILLO 5 2.000,00 400,00 2,1000 1.900,00 380,00 4,5000 1.850,00 370,00 4,9000 50,00 45,00 6,50",
      ],
    });

    const result = await parseCledinorSettlement(buffer);

    expect(result.weightKg).toBeNull();
    expect(result.pricePerKg).toBeNull();
  });

  it("returns null weight/price when there is no category row", async () => {
    const buffer = await buildCledinorSettlementFixturePdf({ ...SAMPLE_INPUT, categoryRows: [] });

    const result = await parseCledinorSettlement(buffer);

    expect(result.weightKg).toBeNull();
    expect(result.pricePerKg).toBeNull();
  });

  it("throws when the guide number is missing", async () => {
    const buffer = await buildCledinorSettlementFixturePdf({ ...SAMPLE_INPUT, guideNumber: "" });
    await expect(parseCledinorSettlement(buffer)).rejects.toThrow("número de guía");
  });

  it("throws when the weigh date is missing", async () => {
    const buffer = await buildCledinorSettlementFixturePdf({ ...SAMPLE_INPUT, weighDateDisplay: "" });
    await expect(parseCledinorSettlement(buffer)).rejects.toThrow("fecha de pesada");
  });

  it("throws when the total is missing", async () => {
    const buffer = await buildCledinorSettlementFixturePdf({ ...SAMPLE_INPUT, total: "" });
    await expect(parseCledinorSettlement(buffer)).rejects.toThrow("total");
  });
});
