import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { parseLocaleCookie } from "@/lib/i18n/dictionaries";
import { requireSession } from "@/lib/dal/session";
import { findAnimalDetailById, animalTagHistoryFor, animalHealthNotesFor } from "@/lib/dal/animal-access";
import { listOwners } from "@/lib/dal/owner-catalog";
import { listSelectableEstablishments } from "@/lib/dal/farm-access";
import { listCategoriesByFarm } from "@/lib/dal/category-catalog";
import { listReproductiveStatusesByFarm } from "@/lib/dal/reproductive-status-catalog";
import { AnimalDetail } from "@/components/animals/animal-detail";

export default async function AnimalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const locale = parseLocaleCookie(cookieStore.get("locale")?.value);

  const session = await requireSession();
  const animal = await findAnimalDetailById(session.user.id, session.user.role, id);
  if (!animal) notFound();

  const [tagHistory, healthNotes, owners, establishments] = await Promise.all([
    animalTagHistoryFor(id),
    animalHealthNotesFor(id),
    listOwners(),
    listSelectableEstablishments(session.user.id, session.user.role),
  ]);

  const farmId = establishments.find((e) => e.id === animal.currentEstablishmentId)?.farmId;
  const categories = farmId ? await listCategoriesByFarm(farmId) : [];
  const reproductiveStatuses = farmId ? await listReproductiveStatusesByFarm(farmId) : [];

  return (
    <AnimalDetail
      animal={animal}
      tagHistory={tagHistory}
      healthNotes={healthNotes}
      owners={owners}
      categories={categories}
      reproductiveStatuses={reproductiveStatuses}
      locale={locale}
    />
  );
}
