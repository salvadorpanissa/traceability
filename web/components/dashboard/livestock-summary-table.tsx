import { translate, type Locale } from "@/lib/i18n/dictionaries";
import type { LivestockSummaryRow } from "@/lib/dashboard/livestock-summary";

export function LivestockSummaryTable({ rows, locale }: { rows: LivestockSummaryRow[]; locale: Locale }) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground">{translate(locale, "livestock.summaryEmpty")}</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="py-1 pr-2">{translate(locale, "livestock.farm")}</th>
          <th className="py-1 pr-2">{translate(locale, "livestock.category")}</th>
          <th className="py-1 pr-2">{translate(locale, "livestock.summaryCount")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${row.farmName}-${row.categoryName}-${index}`} className="border-b last:border-0">
            <td className="py-1 pr-2">{row.farmName ?? translate(locale, "livestock.noFarm")}</td>
            <td className="py-1 pr-2">{row.categoryName ?? translate(locale, "livestock.noCategory")}</td>
            <td className="py-1 pr-2">{row.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
