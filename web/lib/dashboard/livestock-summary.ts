import type { AnimalCurrentStateWithNames } from "@/lib/dal/animal-access";

export type GroupAnimal = { animalId: string; tag: string | null };

export type LivestockByPaddockRow = {
  farmName: string | null;
  paddockName: string | null;
  count: number;
  animals: GroupAnimal[];
};

export type LivestockByCategoryRow = {
  categoryName: string | null;
  count: number;
  animals: GroupAnimal[];
};

export function summarizeLivestockByPaddock(rows: AnimalCurrentStateWithNames[]): LivestockByPaddockRow[] {
  const groups = new Map<string, LivestockByPaddockRow>();

  for (const row of rows) {
    if (row.status !== "alive") continue;

    const key = `${row.farmName ?? ""} ${row.paddockName ?? ""}`;
    const existing = groups.get(key);
    const animal = { animalId: row.animalId, tag: row.currentTag };
    if (existing) {
      existing.count += 1;
      existing.animals.push(animal);
    } else {
      groups.set(key, { farmName: row.farmName, paddockName: row.paddockName, count: 1, animals: [animal] });
    }
  }

  return Array.from(groups.values());
}

export function summarizeLivestockByCategory(rows: AnimalCurrentStateWithNames[]): LivestockByCategoryRow[] {
  const groups = new Map<string, LivestockByCategoryRow>();

  for (const row of rows) {
    if (row.status !== "alive") continue;

    const key = row.categoryName ?? "";
    const existing = groups.get(key);
    const animal = { animalId: row.animalId, tag: row.currentTag };
    if (existing) {
      existing.count += 1;
      existing.animals.push(animal);
    } else {
      groups.set(key, { categoryName: row.categoryName, count: 1, animals: [animal] });
    }
  }

  return Array.from(groups.values());
}
