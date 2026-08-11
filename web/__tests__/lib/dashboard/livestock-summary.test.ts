import { describe, expect, it } from "vitest";
import { summarizeLivestockByPaddock, summarizeLivestockByCategory } from "@/lib/dashboard/livestock-summary";
import type { AnimalLookupDetail } from "@/lib/dal/animal-access";

function row(overrides: Partial<AnimalLookupDetail>): AnimalLookupDetail {
  return {
    animalId: "a1",
    currentTag: "AR1",
    currentEstablishmentId: "f1",
    establishmentName: "Campo Norte",
    currentPaddockId: null,
    paddockName: null,
    currentCategoryId: "c1",
    categoryName: "Vaca",
    status: "alive",
    sex: null,
    breed: null,
    birthDate: null,
    ownerName: null,
    secondaryTag: null,
    notes: null,
    ...overrides,
  };
}

function groupAnimal(overrides: {
  animalId: string;
  tag: string | null;
  categoryName?: string | null;
}): ReturnType<typeof summarizeLivestockByPaddock>[number]["animals"][number] {
  return {
    categoryName: null,
    secondaryTag: null,
    sex: null,
    breed: null,
    ownerName: null,
    birthDate: null,
    notes: null,
    ...overrides,
  };
}

describe("summarizeLivestockByPaddock", () => {
  it("groups alive animals by establishment and paddock, counting each group and listing its animals", () => {
    const rows = [
      row({ animalId: "a1", currentTag: "AR1", establishmentName: "Campo Norte", paddockName: "Potrero 1" }),
      row({ animalId: "a2", currentTag: "AR2", establishmentName: "Campo Norte", paddockName: "Potrero 1" }),
      row({ animalId: "a3", currentTag: "AR3", establishmentName: "Campo Norte", paddockName: "Potrero 2" }),
      row({ animalId: "a4", currentTag: "AR4", establishmentName: "Campo Sur", paddockName: "Potrero 1" }),
    ];

    const summary = summarizeLivestockByPaddock(rows);

    expect(summary).toEqual(
      expect.arrayContaining([
        {
          establishmentName: "Campo Norte",
          paddockName: "Potrero 1",
          count: 2,
          animals: [
            groupAnimal({ animalId: "a1", tag: "AR1", categoryName: "Vaca" }),
            groupAnimal({ animalId: "a2", tag: "AR2", categoryName: "Vaca" }),
          ],
        },
        {
          establishmentName: "Campo Norte",
          paddockName: "Potrero 2",
          count: 1,
          animals: [groupAnimal({ animalId: "a3", tag: "AR3", categoryName: "Vaca" })],
        },
        {
          establishmentName: "Campo Sur",
          paddockName: "Potrero 1",
          count: 1,
          animals: [groupAnimal({ animalId: "a4", tag: "AR4", categoryName: "Vaca" })],
        },
      ])
    );
    expect(summary).toHaveLength(3);
  });

  it("carries each animal's category, secondary tag, sex, breed, owner, and birth date into its group", () => {
    const rows = [
      row({
        animalId: "a1",
        currentTag: "AR1",
        paddockName: "Potrero 1",
        categoryName: "Vaca",
        secondaryTag: "CHIP1",
        sex: "female",
        breed: "Hereford",
        ownerName: "SASG",
        birthDate: "2021-01-01",
      }),
    ];

    const summary = summarizeLivestockByPaddock(rows);

    expect(summary).toEqual([
      {
        establishmentName: "Campo Norte",
        paddockName: "Potrero 1",
        count: 1,
        animals: [
          {
            animalId: "a1",
            tag: "AR1",
            categoryName: "Vaca",
            secondaryTag: "CHIP1",
            sex: "female",
            breed: "Hereford",
            ownerName: "SASG",
            birthDate: "2021-01-01",
            notes: null,
          },
        ],
      },
    ]);
  });

  it("excludes sold and dead animals from the summary", () => {
    const rows = [
      row({ animalId: "a1", status: "alive", paddockName: "Potrero 1" }),
      row({ animalId: "a2", status: "sold", paddockName: "Potrero 1" }),
      row({ animalId: "a3", status: "dead", paddockName: "Potrero 1" }),
    ];

    const summary = summarizeLivestockByPaddock(rows);

    expect(summary).toEqual([
      {
        establishmentName: "Campo Norte",
        paddockName: "Potrero 1",
        count: 1,
        animals: [groupAnimal({ animalId: "a1", tag: "AR1", categoryName: "Vaca" })],
      },
    ]);
  });

  it("groups animals with no establishment or no paddock under a null bucket", () => {
    const rows = [row({ animalId: "a1", establishmentName: null, paddockName: null })];

    const summary = summarizeLivestockByPaddock(rows);

    expect(summary).toEqual([
      {
        establishmentName: null,
        paddockName: null,
        count: 1,
        animals: [groupAnimal({ animalId: "a1", tag: "AR1", categoryName: "Vaca" })],
      },
    ]);
  });

  it("returns an empty array for no rows", () => {
    expect(summarizeLivestockByPaddock([])).toEqual([]);
  });
});

describe("summarizeLivestockByCategory", () => {
  it("groups alive animals by category, counting each group and listing its animals", () => {
    const rows = [
      row({ animalId: "a1", currentTag: "AR1", categoryName: "Vaca" }),
      row({ animalId: "a2", currentTag: "AR2", categoryName: "Vaca" }),
      row({ animalId: "a3", currentTag: "AR3", categoryName: "Novillo" }),
    ];

    const summary = summarizeLivestockByCategory(rows);

    expect(summary).toEqual(
      expect.arrayContaining([
        {
          categoryName: "Vaca",
          count: 2,
          animals: [
            groupAnimal({ animalId: "a1", tag: "AR1", categoryName: "Vaca" }),
            groupAnimal({ animalId: "a2", tag: "AR2", categoryName: "Vaca" }),
          ],
        },
        {
          categoryName: "Novillo",
          count: 1,
          animals: [groupAnimal({ animalId: "a3", tag: "AR3", categoryName: "Novillo" })],
        },
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

    expect(summary).toEqual([
      { categoryName: "Vaca", count: 1, animals: [groupAnimal({ animalId: "a1", tag: "AR1", categoryName: "Vaca" })] },
    ]);
  });

  it("groups animals with no category under a null bucket", () => {
    const rows = [row({ animalId: "a1", categoryName: null })];

    const summary = summarizeLivestockByCategory(rows);

    expect(summary).toEqual([
      { categoryName: null, count: 1, animals: [groupAnimal({ animalId: "a1", tag: "AR1", categoryName: null })] },
    ]);
  });

  it("returns an empty array for no rows", () => {
    expect(summarizeLivestockByCategory([])).toEqual([]);
  });

  it("sorts groups alphabetically by category name, with the no-category bucket last", () => {
    const rows = [
      row({ animalId: "a1", categoryName: "Vaca de invernada" }),
      row({ animalId: "a2", categoryName: null }),
      row({ animalId: "a3", categoryName: "Ternero" }),
      row({ animalId: "a4", categoryName: "Vaca de cría" }),
    ];

    const summary = summarizeLivestockByCategory(rows);

    expect(summary.map((r) => r.categoryName)).toEqual(["Ternero", "Vaca de cría", "Vaca de invernada", null]);
  });
});
