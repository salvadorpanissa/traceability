import type { AnimalLookupDetail } from "@/lib/dal/animal-access";

export type GroupAnimal = {
  animalId: string;
  tag: string | null;
  categoryName: string | null;
  secondaryTag: string | null;
  sex: "male" | "female" | null;
  breed: string | null;
  ownerName: string | null;
  birthDate: string | null;
  notes: string | null;
};

export type LivestockByPaddockRow = {
  establishmentName: string | null;
  paddockName: string | null;
  count: number;
  animals: GroupAnimal[];
};

export type LivestockByCategoryRow = {
  categoryName: string | null;
  count: number;
  animals: GroupAnimal[];
};

function toGroupAnimal(row: AnimalLookupDetail): GroupAnimal {
  return {
    animalId: row.animalId,
    tag: row.currentTag,
    categoryName: row.categoryName,
    secondaryTag: row.secondaryTag,
    sex: row.sex,
    breed: row.breed,
    ownerName: row.ownerName,
    birthDate: row.birthDate,
    notes: row.notes,
  };
}

export function summarizeLivestockByPaddock(rows: AnimalLookupDetail[]): LivestockByPaddockRow[] {
  const groups = new Map<string, LivestockByPaddockRow>();

  for (const row of rows) {
    if (row.status !== "alive") continue;

    const key = `${row.establishmentName ?? ""} ${row.paddockName ?? ""}`;
    const existing = groups.get(key);
    const animal = toGroupAnimal(row);
    if (existing) {
      existing.count += 1;
      existing.animals.push(animal);
    } else {
      groups.set(key, { establishmentName: row.establishmentName, paddockName: row.paddockName, count: 1, animals: [animal] });
    }
  }

  return Array.from(groups.values());
}

export function summarizeLivestockByCategory(rows: AnimalLookupDetail[]): LivestockByCategoryRow[] {
  const groups = new Map<string, LivestockByCategoryRow>();

  for (const row of rows) {
    if (row.status !== "alive") continue;

    const key = row.categoryName ?? "";
    const existing = groups.get(key);
    const animal = toGroupAnimal(row);
    if (existing) {
      existing.count += 1;
      existing.animals.push(animal);
    } else {
      groups.set(key, { categoryName: row.categoryName, count: 1, animals: [animal] });
    }
  }

  // Sorted alphabetically by name (locale-aware, so accents sort naturally)
  // instead of insertion order, which otherwise depended on the order rows
  // happened to arrive from the DB query. The "sin categoría" bucket has no
  // name to sort by, so it always sorts last.
  return Array.from(groups.values()).sort((a, b) => {
    if (a.categoryName === null) return 1;
    if (b.categoryName === null) return -1;
    return a.categoryName.localeCompare(b.categoryName, "es");
  });
}
