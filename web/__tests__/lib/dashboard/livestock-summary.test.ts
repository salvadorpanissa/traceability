import { describe, expect, it } from "vitest";
import { summarizeLivestockByFarmAndCategory } from "@/lib/dashboard/livestock-summary";
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

describe("summarizeLivestockByFarmAndCategory", () => {
  it("groups alive animals by farm and category, counting each group", () => {
    const rows = [
      row({ animalId: "a1", farmName: "Campo Norte", categoryName: "Vaca" }),
      row({ animalId: "a2", farmName: "Campo Norte", categoryName: "Vaca" }),
      row({ animalId: "a3", farmName: "Campo Norte", categoryName: "Novillo" }),
      row({ animalId: "a4", farmName: "Campo Sur", categoryName: "Vaca" }),
    ];

    const summary = summarizeLivestockByFarmAndCategory(rows);

    expect(summary).toEqual(
      expect.arrayContaining([
        { farmName: "Campo Norte", categoryName: "Vaca", count: 2 },
        { farmName: "Campo Norte", categoryName: "Novillo", count: 1 },
        { farmName: "Campo Sur", categoryName: "Vaca", count: 1 },
      ])
    );
    expect(summary).toHaveLength(3);
  });

  it("excludes sold and dead animals from the summary", () => {
    const rows = [
      row({ animalId: "a1", status: "alive" }),
      row({ animalId: "a2", status: "sold" }),
      row({ animalId: "a3", status: "dead" }),
    ];

    const summary = summarizeLivestockByFarmAndCategory(rows);

    expect(summary).toEqual([{ farmName: "Campo Norte", categoryName: "Vaca", count: 1 }]);
  });

  it("groups animals with no farm or no category under a null bucket", () => {
    const rows = [row({ animalId: "a1", farmName: null, categoryName: null })];

    const summary = summarizeLivestockByFarmAndCategory(rows);

    expect(summary).toEqual([{ farmName: null, categoryName: null, count: 1 }]);
  });

  it("returns an empty array for no rows", () => {
    expect(summarizeLivestockByFarmAndCategory([])).toEqual([]);
  });
});
