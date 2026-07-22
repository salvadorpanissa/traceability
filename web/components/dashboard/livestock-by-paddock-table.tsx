import { translate, type Locale } from "@/lib/i18n/dictionaries";
import type { LivestockByPaddockRow } from "@/lib/dashboard/livestock-summary";

export function LivestockByPaddockTable({ rows, locale }: { rows: LivestockByPaddockRow[]; locale: Locale }) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground">{translate(locale, "livestock.byPaddockEmpty")}</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="py-1 pr-2">{translate(locale, "livestock.farm")}</th>
          <th className="py-1 pr-2">{translate(locale, "livestock.paddock")}</th>
          <th className="py-1 pr-2">{translate(locale, "livestock.summaryCount")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${row.farmName}-${row.paddockName}-${index}`} className="border-b last:border-0">
            <td className="py-1 pr-2">{row.farmName ?? translate(locale, "livestock.noFarm")}</td>
            <td className="py-1 pr-2">{row.paddockName ?? translate(locale, "livestock.noPaddock")}</td>
            <td className="py-1 pr-2">{row.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
