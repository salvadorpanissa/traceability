import { cookies } from "next/headers";
import { parseLocaleCookie, translate } from "@/lib/i18n/dictionaries";
import { requireSession } from "@/lib/dal/session";
import { visibleAnimalDetails } from "@/lib/dal/animal-access";
import { listOwners } from "@/lib/dal/owner-catalog";
import { listSelectableEstablishments } from "@/lib/dal/farm-access";
import { listCategoriesByFarm, type CategoryCatalogEntry } from "@/lib/dal/category-catalog";
import { listReproductiveStatusesByFarm, type ReproductiveStatusCatalogEntry } from "@/lib/dal/reproductive-status-catalog";
import { AnimalsTable } from "@/components/animals/animals-table";

export default async function AnimalsPage() {
  const cookieStore = await cookies();
  const locale = parseLocaleCookie(cookieStore.get("locale")?.value);

  const session = await requireSession();
  const [rows, owners, establishments] = await Promise.all([
    visibleAnimalDetails(session.user.id, session.user.role),
    listOwners(),
    listSelectableEstablishments(session.user.id, session.user.role),
  ]);

  const farmIds = [...new Set(establishments.map((e) => e.farmId))];
  const categoriesByFarmId = new Map(
    await Promise.all(farmIds.map(async (farmId): Promise<[string, CategoryCatalogEntry[]]> => [farmId, await listCategoriesByFarm(farmId)]))
  );
  const categoriesByEstablishmentId: Record<string, CategoryCatalogEntry[]> = {};
  for (const establishment of establishments) {
    categoriesByEstablishmentId[establishment.id] = categoriesByFarmId.get(establishment.farmId) ?? [];
  }

  const reproductiveStatusesByFarmId = new Map(
    await Promise.all(
      farmIds.map(async (farmId): Promise<[string, ReproductiveStatusCatalogEntry[]]> => [farmId, await listReproductiveStatusesByFarm(farmId)])
    )
  );
  const reproductiveStatusesByEstablishmentId: Record<string, ReproductiveStatusCatalogEntry[]> = {};
  for (const establishment of establishments) {
    reproductiveStatusesByEstablishmentId[establishment.id] = reproductiveStatusesByFarmId.get(establishment.farmId) ?? [];
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{translate(locale, "animals.title")}</h1>
      <AnimalsTable
        rows={rows}
        owners={owners}
        categoriesByEstablishmentId={categoriesByEstablishmentId}
        reproductiveStatusesByEstablishmentId={reproductiveStatusesByEstablishmentId}
        locale={locale}
      />
    </div>
  );
}
