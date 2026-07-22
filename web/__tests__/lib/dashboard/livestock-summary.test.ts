import { describe, expect, it } from "vitest";
import { summarizeLivestockByPaddock, summarizeLivestockByCategory } from "@/lib/dashboard/livestock-summary";
import type { AnimalCurrentStateWithNames } from "@/lib/dal/animal-access";

function row(overrides: Partial<AnimalCurrentStateWithNames>): AnimalCurrentStateWithNames {
  return {
    animalId: "a1",
    currentTag: "AR1",
    currentFarmId: "f1",
    farmName: "Campo Norte",
    currentPaddockId: null,
    paddockName: null,
    currentCategoryId: "c1",
    categoryName: "Vaca",
    status: "alive",
    ...overrides,
  };
}

describe("summarizeLivestockByPaddock", () => {
  it("groups alive animals by farm and paddock, counting each group", () => {
    const rows = [
      row({ animalId: "a1", farmName: "Campo Norte", paddockName: "Potrero 1" }),
      row({ animalId: "a2", farmName: "Campo Norte", paddockName: "Potrero 1" }),
      row({ animalId: "a3", farmName: "Campo Norte", paddockName: "Potrero 2" }),
      row({ animalId: "a4", farmName: "Campo Sur", paddockName: "Potrero 1" }),
    ];

    const summary = summarizeLivestockByPaddock(rows);

    expect(summary).toEqual(
      expect.arrayContaining([
        { farmName: "Campo Norte", paddockName: "Potrero 1", count: 2 },
        { farmName: "Campo Norte", paddockName: "Potrero 2", count: 1 },
        { farmName: "Campo Sur", paddockName: "Potrero 1", count: 1 },
      ])
    );
    expect(summary).toHaveLength(3);
  });

  it("excludes sold and dead animals from the summary", () => {
    const rows = [
      row({ animalId: "a1", status: "alive", paddockName: "Potrero 1" }),
      row({ animalId: "a2", status: "sold", paddockName: "Potrero 1" }),
      row({ animalId: "a3", status: "dead", paddockName: "Potrero 1" }),
    ];

    const summary = summarizeLivestockByPaddock(rows);

    expect(summary).toEqual([{ farmName: "Campo Norte", paddockName: "Potrero 1", count: 1 }]);
  });

  it("groups animals with no farm or no paddock under a null bucket", () => {
    const rows = [row({ animalId: "a1", farmName: null, paddockName: null })];

    const summary = summarizeLivestockByPaddock(rows);

    expect(summary).toEqual([{ farmName: null, paddockName: null, count: 1 }]);
  });

  it("returns an empty array for no rows", () => {
    expect(summarizeLivestockByPaddock([])).toEqual([]);
  });
});

describe("summarizeLivestockByCategory", () => {
  it("groups alive animals by category, counting each group", () => {
    const rows = [
      row({ animalId: "a1", categoryName: "Vaca" }),
      row({ animalId: "a2", categoryName: "Vaca" }),
      row({ animalId: "a3", categoryName: "Novillo" }),
    ];

    const summary = summarizeLivestockByCategory(rows);

    expect(summary).toEqual(
      expect.arrayContaining([
        { categoryName: "Vaca", count: 2 },
        { categoryName: "Novillo", count: 1 },
      ])
    );
    expect(summary).toHaveLength(2);
  });

  it("excludes sold and dead animals from the summary", () => {
    const rows = [
      row({ animalId: "a1", status: "alive", categoryName: "Vaca" }),
      row({ animalId: "a2", status: "sold", categoryName: "Vaca" }),
      row({ animalId: "a3", status: "dead", categoryName: "Vaca" }),
    ];

    const summary = summarizeLivestockByCategory(rows);

    expect(summary).toEqual([{ categoryName: "Vaca", count: 1 }]);
  });

  it("groups animals with no category under a null bucket", () => {
    const rows = [row({ animalId: "a1", categoryName: null })];

    const summary = summarizeLivestockByCategory(rows);

    expect(summary).toEqual([{ categoryName: null, count: 1 }]);
  });

  it("returns an empty array for no rows", () => {
    expect(summarizeLivestockByCategory([])).toEqual([]);
  });
});
