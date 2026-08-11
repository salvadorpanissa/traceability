import { cookies } from "next/headers";
import { parseLocaleCookie, translate } from "@/lib/i18n/dictionaries";
import { requireSession } from "@/lib/dal/session";
import { visibleAnimalDetails } from "@/lib/dal/animal-access";
import { summarizeLivestockByPaddock, summarizeLivestockByCategory } from "@/lib/dashboard/livestock-summary";
import { visibleHealthBatchesSince, countDistinctAnimalsTreatedSince } from "@/lib/dashboard/health-batch-summary";
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
  const recentHealthSinceDate = monthsAgoISODate(RECENT_HEALTH_MONTHS);
  const [rows, healthBatches, healthEventsLastMonths, staleTags] = await Promise.all([
    visibleAnimalDetails(session.user.id, session.user.role),
    visibleHealthBatchesSince(session.user.id, session.user.role, recentHealthSinceDate),
    countDistinctAnimalsTreatedSince(session.user.id, session.user.role, recentHealthSinceDate),
    findStaleTags(session.user.id, session.user.role, DEFAULT_STALE_TAG_THRESHOLD_DAYS),
  ]);

  const alive = rows.filter((r) => r.status === "alive");
  const byPaddock = summarizeLivestockByPaddock(rows);
  const byCategory = summarizeLivestockByCategory(rows);

  const totalLivestock = alive.length;
  const activePaddocks = new Set(
    alive.filter((r) => r.paddockName).map((r) => `${r.establishmentName ?? ""}::${r.paddockName ?? ""}`)
  ).size;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{translate(locale, "dashboard.title")}</h1>

      {/* Stats cards row */}
      <StatCards
        totalLivestock={totalLivestock}
        animalChange={0}
        activePaddocks={activePaddocks}
        healthEventsLastMonths={healthEventsLastMonths}
      />

      {/*
        Two independent flowing columns (tables 2/3, their data panels 1/3),
        not three stacked row-grids — a row-grid locks both cells to the
        tallest one's height, leaving a dead gap under whichever side is
        shorter. Each column stacks its own items with its own gap, so a
        short "Preguntale a la IA" box doesn't push "Animales por potrero"
        down to match the taller "Stock por categoría" chart next to it.
      */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <div>
            <h2 className="mb-3 text-lg font-semibold">{translate(locale, "dashboard.aiQuestionsTitle")}</h2>
            <NaturalLanguageQuery locale={locale} />
          </div>
          <div>
            <h2 className="mb-3 text-lg font-semibold">{translate(locale, "livestock.byPaddockTitle")}</h2>
            <LivestockByPaddockTable rows={byPaddock} locale={locale} />
          </div>
          <div>
            <h2 className="mb-3 text-lg font-semibold">{translate(locale, "dashboard.recentHealthTitle")}</h2>
            <p className="mb-3 text-xs text-muted-foreground">{translate(locale, "dashboard.recentHealthLastMonths")}</p>
            <RecentHealthEvents batches={healthBatches} />
          </div>
        </div>
        <div className="flex flex-col gap-6 lg:col-span-1">
          <div>
            <h2 className="mb-3 text-lg font-semibold">{translate(locale, "dashboard.stockByCategoryTitle")}</h2>
            <div className="rounded-xl border bg-card p-4">
              <StockByCategoryChart rows={byCategory} />
            </div>
          </div>
          <div>
            <h2 className="mb-3 text-lg font-semibold">{translate(locale, "dashboard.staleTagsTitle")}</h2>
            <StaleTagAlerts
              initialRows={staleTags}
              initialThreshold={DEFAULT_STALE_TAG_THRESHOLD_DAYS}
              locale={locale}
            />
          </div>
          <div>
            <AnimalLookup locale={locale} />
          </div>
        </div>
      </div>
    </div>
  );
}
