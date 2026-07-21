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

export type AnimalCurrentStateWithNames = {
  animalId: string;
  currentTag: string | null;
  currentFarmId: string | null;
  farmName: string | null;
  currentPaddockId: string | null;
  paddockName: string | null;
  currentCategoryId: string | null;
  categoryName: string | null;
  status: string;
};

type CurrentStateWithNamesRow = {
  animal_id: string;
  current_tag: string | null;
  current_farm_id: string | null;
  farm_name: string | null;
  current_paddock_id: string | null;
  paddock_name: string | null;
  current_category_id: string | null;
  category_name: string | null;
  status: string;
};

function toAnimalCurrentStateWithNames(row: CurrentStateWithNamesRow): AnimalCurrentStateWithNames {
  return {
    animalId: row.animal_id,
    currentTag: row.current_tag,
    currentFarmId: row.current_farm_id,
    farmName: row.farm_name,
    currentPaddockId: row.current_paddock_id,
    paddockName: row.paddock_name,
    currentCategoryId: row.current_category_id,
    categoryName: row.category_name,
    status: row.status,
  };
}

const CURRENT_STATE_WITH_NAMES_SELECT = sql`
  select
    acs.animal_id,
    acs.current_tag,
    acs.current_farm_id,
    f.name as farm_name,
    acs.current_paddock_id,
    p.name as paddock_name,
    acs.current_category_id,
    c.name as category_name,
    acs.status
  from animal_current_state acs
  left join farm f on f.id = acs.current_farm_id
  left join paddock p on p.id = acs.current_paddock_id
  left join category c on c.id = acs.current_category_id
`;

export async function visibleCurrentStateWithNames(
  userId: string,
  role: string | undefined
): Promise<AnimalCurrentStateWithNames[]> {
  if (isAdmin(role)) {
    const result = await db.execute<CurrentStateWithNamesRow>(CURRENT_STATE_WITH_NAMES_SELECT);
    return result.rows.map(toAnimalCurrentStateWithNames);
  }

  const farmIds = await userFarmIds(userId);
  if (farmIds.length === 0) return [];

  const farmIdList = sql.join(
    farmIds.map((farmId) => sql`${farmId}`),
    sql`, `
  );
  const result = await db.execute<CurrentStateWithNamesRow>(
    sql`${CURRENT_STATE_WITH_NAMES_SELECT} where acs.current_farm_id in (${farmIdList})`
  );
  return result.rows.map(toAnimalCurrentStateWithNames);
}
