import { cookies } from "next/headers";
import { parseLocaleCookie, translate } from "@/lib/i18n/dictionaries";
import { requireSession } from "@/lib/dal/session";
import { visibleCurrentStateWithNames } from "@/lib/dal/animal-access";
import { summarizeLivestockByFarmAndCategory } from "@/lib/dashboard/livestock-summary";
import { LivestockStatusTable } from "@/components/dashboard/livestock-status-table";
import { LivestockSummaryTable } from "@/components/dashboard/livestock-summary-table";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const locale = parseLocaleCookie(cookieStore.get("locale")?.value);

  const session = await requireSession();
  const rows = await visibleCurrentStateWithNames(session.user.id, session.user.role);
  const summaryRows = summarizeLivestockByFarmAndCategory(rows);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{translate(locale, "dashboard.title")}</h1>
        <p className="text-muted-foreground">{translate(locale, "dashboard.reportsNotice")}</p>
      </div>
      <div>
        <h2 className="mb-2 text-lg font-semibold">{translate(locale, "livestock.title")}</h2>
        <LivestockStatusTable rows={rows} locale={locale} />
      </div>
      <div>
        <h2 className="mb-2 text-lg font-semibold">{translate(locale, "livestock.summaryTitle")}</h2>
        <LivestockSummaryTable rows={summaryRows} locale={locale} />
      </div>
    </div>
  );
}
