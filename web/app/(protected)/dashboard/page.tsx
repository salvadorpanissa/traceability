import { cookies } from "next/headers";
import { parseLocaleCookie, translate } from "@/lib/i18n/dictionaries";
import { requireSession } from "@/lib/dal/session";
import { visibleCurrentStateWithNames } from "@/lib/dal/animal-access";
import { visibleHealthEventsSince } from "@/lib/dal/health-event-access";
import { summarizeLivestockByPaddock, summarizeLivestockByCategory } from "@/lib/dashboard/livestock-summary";
import { summarizeHealthByPlace, monthsAgoISODate } from "@/lib/dashboard/health-place-summary";
import { LivestockByPaddockTable } from "@/components/dashboard/livestock-by-paddock-table";
import { LivestockByCategoryTable } from "@/components/dashboard/livestock-by-category-table";
import { NaturalLanguageQuery } from "@/components/dashboard/natural-language-query";
import { AnimalLookup } from "@/components/dashboard/animal-lookup";
import { HealthByPlaceTable } from "@/components/dashboard/health-by-place-table";

const DEFAULT_HEALTH_SUMMARY_MONTHS = 3;

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const locale = parseLocaleCookie(cookieStore.get("locale")?.value);

  const session = await requireSession();
  const [rows, healthEventRows] = await Promise.all([
    visibleCurrentStateWithNames(session.user.id, session.user.role),
    visibleHealthEventsSince(
      session.user.id,
      session.user.role,
      monthsAgoISODate(DEFAULT_HEALTH_SUMMARY_MONTHS)
    ),
  ]);
  const byPaddock = summarizeLivestockByPaddock(rows);
  const byCategory = summarizeLivestockByCategory(rows);
  const byHealthPlace = summarizeHealthByPlace(healthEventRows);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{translate(locale, "dashboard.title")}</h1>
      </div>
      <div>
        <NaturalLanguageQuery locale={locale} />
      </div>
      <div>
        <AnimalLookup locale={locale} />
      </div>
      <div>
        <h2 className="mb-2 text-lg font-semibold">{translate(locale, "livestock.byPaddockTitle")}</h2>
        <LivestockByPaddockTable rows={byPaddock} locale={locale} />
      </div>
      <div>
        <h2 className="mb-2 text-lg font-semibold">{translate(locale, "livestock.byCategoryTitle")}</h2>
        <LivestockByCategoryTable rows={byCategory} locale={locale} />
      </div>
      <div>
        <h2 className="mb-2 text-lg font-semibold">{translate(locale, "healthByPlace.title")}</h2>
        <HealthByPlaceTable initialRows={byHealthPlace} initialMonths={DEFAULT_HEALTH_SUMMARY_MONTHS} locale={locale} />
      </div>
    </div>
  );
}
