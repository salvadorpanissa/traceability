import { translate, type Locale, type TranslationKey } from "@/lib/i18n/dictionaries";
import type { AnimalCurrentStateWithNames } from "@/lib/dal/animal-access";

const STATUS_KEYS: Record<string, TranslationKey> = {
  alive: "livestock.statusAlive",
  sold: "livestock.statusSold",
  dead: "livestock.statusDead",
};

function statusLabel(status: string, locale: Locale): string {
  const key = STATUS_KEYS[status] ?? "livestock.statusAlive";
  return translate(locale, key);
}

export function LivestockStatusTable({
  rows,
  locale,
}: {
  rows: AnimalCurrentStateWithNames[];
  locale: Locale;
}) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground">{translate(locale, "livestock.empty")}</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="py-1 pr-2">{translate(locale, "livestock.tag")}</th>
          <th className="py-1 pr-2">{translate(locale, "livestock.farm")}</th>
          <th className="py-1 pr-2">{translate(locale, "livestock.paddock")}</th>
          <th className="py-1 pr-2">{translate(locale, "livestock.category")}</th>
          <th className="py-1 pr-2">{translate(locale, "livestock.status")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.animalId} className="border-b last:border-0">
            <td className="py-1 pr-2">{row.currentTag ?? "—"}</td>
            <td className="py-1 pr-2">{row.farmName ?? "—"}</td>
            <td className="py-1 pr-2">{row.paddockName ?? "—"}</td>
            <td className="py-1 pr-2">{row.categoryName ?? "—"}</td>
            <td className="py-1 pr-2">{statusLabel(row.status, locale)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
