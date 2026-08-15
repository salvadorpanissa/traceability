import { cookies } from "next/headers";
import { parseLocaleCookie, translate } from "@/lib/i18n/dictionaries";
import { requireSession } from "@/lib/dal/session";
import { visibleAnimalDetails } from "@/lib/dal/animal-access";
import { AnimalsTable } from "@/components/animals/animals-table";

export default async function AnimalsPage() {
  const cookieStore = await cookies();
  const locale = parseLocaleCookie(cookieStore.get("locale")?.value);

  const session = await requireSession();
  const rows = await visibleAnimalDetails(session.user.id, session.user.role);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{translate(locale, "animals.title")}</h1>
      <AnimalsTable rows={rows} locale={locale} />
    </div>
  );
}
