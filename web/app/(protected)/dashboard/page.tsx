import { cookies } from "next/headers";
import { parseLocaleCookie, translate } from "@/lib/i18n/dictionaries";
import { requireSession } from "@/lib/dal/session";
import { visibleCurrentStateWithNames } from "@/lib/dal/animal-access";
import { summarizeLivestockByPaddock, summarizeLivestockByCategory } from "@/lib/dashboard/livestock-summary";
import { LivestockByPaddockTable } from "@/components/dashboard/livestock-by-paddock-table";
import { LivestockByCategoryTable } from "@/components/dashboard/livestock-by-category-table";
import { NaturalLanguageQuery } from "@/components/dashboard/natural-language-query";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const locale = parseLocaleCookie(cookieStore.get("locale")?.value);

  const session = await requireSession();
  const rows = await visibleCurrentStateWithNames(session.user.id, session.user.role);
  const byPaddock = summarizeLivestockByPaddock(rows);
  const byCategory = summarizeLivestockByCategory(rows);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{translate(locale, "dashboard.title")}</h1>
      </div>
      <div>
        <NaturalLanguageQuery locale={locale} />
      </div>
      <div>
        <h2 className="mb-2 text-lg font-semibold">{translate(locale, "livestock.byPaddockTitle")}</h2>
        <LivestockByPaddockTable rows={byPaddock} locale={locale} />
      </div>
      <div>
        <h2 className="mb-2 text-lg font-semibold">{translate(locale, "livestock.byCategoryTitle")}</h2>
        <LivestockByCategoryTable rows={byCategory} locale={locale} />
      </div>
    </div>
  );
}
