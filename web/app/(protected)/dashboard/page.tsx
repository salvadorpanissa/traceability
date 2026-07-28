import { cookies } from "next/headers";
import { parseLocaleCookie, translate } from "@/lib/i18n/dictionaries";
import { requireSession } from "@/lib/dal/session";
import { visibleCurrentStateWithNames } from "@/lib/dal/animal-access";
import { summarizeLivestockByPaddock, summarizeLivestockByCategory } from "@/lib/dashboard/livestock-summary";
import { visibleHealthBatchesSince, countDistinctAnimalsTreatedThisMonth } from "@/lib/dashboard/health-batch-summary";
import { LivestockByPaddockTable } from "@/components/dashboard/livestock-by-paddock-table";
import { StockByCategoryChart } from "@/components/dashboard/stock-by-category-chart";
import { StatCards } from "@/components/dashboard/stat-cards";
import { RecentHealthEvents } from "@/components/dashboard/recent-health-events";
import { AnimalLookup } from "@/components/dashboard/animal-lookup";
import { NaturalLanguageQuery } from "@/components/dashboard/natural-language-query";
import { findStaleTags } from "@/lib/dashboard/stale-tag-summary";
import { StaleTagAlerts } from "@/components/dashboard/stale-tag-alerts";

const RECENT_HEALTH_MONTHS = 3;
const DEFAULT_STALE_TAG_THRESHOLD_DAYS = 100;

function monthsAgoISODate(months: number, from: Date = new Date()): string {
  const date = new Date(from);
  date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 10);
}

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const locale = parseLocaleCookie(cookieStore.get("locale")?.value);

  const session = await requireSession();
  const [rows, healthBatches, healthEventsThisMonth, staleTags] = await Promise.all([
    visibleCurrentStateWithNames(session.user.id, session.user.role),
    visibleHealthBatchesSince(
      session.user.id,
      session.user.role,
      monthsAgoISODate(RECENT_HEALTH_MONTHS)
    ),
    countDistinctAnimalsTreatedThisMonth(session.user.id, session.user.role),
    findStaleTags(session.user.id, session.user.role, DEFAULT_STALE_TAG_THRESHOLD_DAYS),
  ]);

  const alive = rows.filter((r) => r.status === "alive");
  const byPaddock = summarizeLivestockByPaddock(rows);
  const byCategory = summarizeLivestockByCategory(rows);

  const totalLivestock = alive.length;
  const activePaddocks = new Set(
    alive.filter((r) => r.paddockName).map((r) => `${r.farmName ?? ""}::${r.paddockName ?? ""}`)
  ).size;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{translate(locale, "dashboard.title")}</h1>

      {/* Stats cards row */}
      <StatCards
        totalLivestock={totalLivestock}
        animalChange={0}
        activePaddocks={activePaddocks}
        healthEventsThisMonth={healthEventsThisMonth}
      />

      {/* Two-column: paddock table | stock by category + animal lookup */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <div>
          <h2 className="mb-3 text-lg font-semibold">{translate(locale, "livestock.byPaddockTitle")}</h2>
          <LivestockByPaddockTable rows={byPaddock} locale={locale} />
        </div>
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="mb-3 text-lg font-semibold">{translate(locale, "dashboard.stockByCategoryTitle")}</h2>
            <div className="rounded-xl border bg-card p-4">
              <StockByCategoryChart rows={byCategory} />
            </div>
          </div>
          <div>
            <AnimalLookup locale={locale} />
          </div>
          <div>
            <h2 className="mb-3 text-lg font-semibold">{translate(locale, "dashboard.staleTagsTitle")}</h2>
            <StaleTagAlerts
              initialRows={staleTags}
              initialThreshold={DEFAULT_STALE_TAG_THRESHOLD_DAYS}
              locale={locale}
            />
          </div>
        </div>
      </div>

      {/* AI questions full width */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">{translate(locale, "dashboard.aiQuestionsTitle")}</h2>
        <NaturalLanguageQuery locale={locale} />
      </div>

      {/* Recent health full width */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">{translate(locale, "dashboard.recentHealthTitle")}</h2>
        <p className="mb-3 text-xs text-muted-foreground">{translate(locale, "dashboard.recentHealthLastMonths")}</p>
        <RecentHealthEvents batches={healthBatches} />
      </div>
    </div>
  );
}
