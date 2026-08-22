import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { parseLocaleCookie } from "@/lib/i18n/dictionaries";
import { requireSession } from "@/lib/dal/session";
import { findAnimalDetailById, animalTagHistoryFor, animalHealthNotesFor, animalPesajesFor } from "@/lib/dal/animal-access";
import { listOwnersByFarms } from "@/lib/dal/owner-catalog";
import { listSelectableEstablishments, listSelectableFarms } from "@/lib/dal/farm-access";
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

  const [tagHistory, healthNotes, pesajes, farms, establishments] = await Promise.all([
    animalTagHistoryFor(id),
    animalHealthNotesFor(id),
    animalPesajesFor(id),
    listSelectableFarms(session.user.id, session.user.role),
    listSelectableEstablishments(session.user.id, session.user.role),
  ]);
  const owners = await listOwnersByFarms(farms.map((f) => f.id));

  const farmId = establishments.find((e) => e.id === animal.currentEstablishmentId)?.farmId;
  const categories = farmId ? await listCategoriesByFarm(farmId) : [];
  const reproductiveStatuses = farmId ? await listReproductiveStatusesByFarm(farmId) : [];

  return (
    <AnimalDetail
      animal={animal}
      tagHistory={tagHistory}
      healthNotes={healthNotes}
      pesajes={pesajes}
      owners={owners}
      categories={categories}
      reproductiveStatuses={reproductiveStatuses}
      locale={locale}
    />
  );
}
