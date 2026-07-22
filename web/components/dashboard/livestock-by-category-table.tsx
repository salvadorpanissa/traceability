import { translate, type Locale } from "@/lib/i18n/dictionaries";
import type { LivestockByCategoryRow } from "@/lib/dashboard/livestock-summary";

export function LivestockByCategoryTable({ rows, locale }: { rows: LivestockByCategoryRow[]; locale: Locale }) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground">{translate(locale, "livestock.byCategoryEmpty")}</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="py-1 pr-2">{translate(locale, "livestock.category")}</th>
          <th className="py-1 pr-2">{translate(locale, "livestock.summaryCount")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${row.categoryName}-${index}`} className="border-b last:border-0">
            <td className="py-1 pr-2">{row.categoryName ?? translate(locale, "livestock.noCategory")}</td>
            <td className="py-1 pr-2">{row.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
