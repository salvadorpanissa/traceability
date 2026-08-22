import { listReproductiveStatusesByFarm, createReproductiveStatus } from "@/lib/dal/reproductive-status-catalog";

// Turns a raw-value -> typed-name map (collected before the farm was even
// known, e.g. Sanidad's/Recategorización's/Traslado's estado-reproductivo
// step) into a raw-value -> reproductive_status.id map, reusing an existing
// status by case-insensitive name match or creating one. A blank name means
// "sin dato" and resolves to "" without touching the catalog, same meaning
// an empty reproductiveStatusValueMap entry already has everywhere else.
export async function resolveReproductiveStatusNames(
  farmId: string,
  nameMap: Record<string, string>
): Promise<Record<string, string>> {
  const catalog = await listReproductiveStatusesByFarm(farmId);
  const idByLowerName = new Map(catalog.map((s) => [s.name.trim().toLowerCase(), s.id]));

  const result: Record<string, string> = {};
  for (const [rawValue, name] of Object.entries(nameMap)) {
    const trimmed = name.trim();
    if (!trimmed) {
      result[rawValue] = "";
      continue;
    }
    const existingId = idByLowerName.get(trimmed.toLowerCase());
    if (existingId) {
      result[rawValue] = existingId;
      continue;
    }
    const created = await createReproductiveStatus(farmId, trimmed);
    idByLowerName.set(trimmed.toLowerCase(), created.id);
    result[rawValue] = created.id;
  }
  return result;
}
