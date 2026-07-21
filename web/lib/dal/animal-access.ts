import { sql } from "drizzle-orm";
import { db } from "@/db";
import { isAdmin, userFarmIds } from "@/lib/dal/farm-access";

export function requireTransferAuthorization(
  role: string | undefined,
  originFarmId: string,
  destinationFarmId: string
): void {
  if (originFarmId === destinationFarmId) return;
  if (!isAdmin(role)) {
    throw new Error("Solo un admin puede crear un traslado entre campos distintos");
  }
}

export type AnimalCurrentState = {
  animalId: string;
  currentTag: string | null;
  currentFarmId: string | null;
  currentCategoryId: string | null;
  status: string;
};

type CurrentStateRow = {
  animal_id: string;
  current_tag: string | null;
  current_farm_id: string | null;
  current_category_id: string | null;
  status: string;
};

function toAnimalCurrentState(row: CurrentStateRow): AnimalCurrentState {
  return {
    animalId: row.animal_id,
    currentTag: row.current_tag,
    currentFarmId: row.current_farm_id,
    currentCategoryId: row.current_category_id,
    status: row.status,
  };
}

export async function visibleCurrentState(userId: string, role: string | undefined): Promise<AnimalCurrentState[]> {
  if (isAdmin(role)) {
    const result = await db.execute<CurrentStateRow>(sql`select * from animal_current_state`);
    return result.rows.map(toAnimalCurrentState);
  }

  const farmIds = await userFarmIds(userId);
  if (farmIds.length === 0) return [];

  const farmIdList = sql.join(
    farmIds.map((farmId) => sql`${farmId}`),
    sql`, `
  );
  const result = await db.execute<CurrentStateRow>(
    sql`select * from animal_current_state where current_farm_id in (${farmIdList})`
  );
  return result.rows.map(toAnimalCurrentState);
}
