"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { translate, type Locale, type TranslationKey } from "@/lib/i18n/dictionaries";
import type { AnimalCurrentStateWithNames } from "@/lib/dal/animal-access";

const STATUS_KEYS: Record<string, TranslationKey> = {
  alive: "livestock.statusAlive",
  sold: "livestock.statusSold",
  dead: "livestock.statusDead",
};

const COLLAPSED_ROW_COUNT = 5;

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
  const [expanded, setExpanded] = useState(false);

  if (rows.length === 0) {
    return <p className="text-muted-foreground">{translate(locale, "livestock.empty")}</p>;
  }

  const canExpand = rows.length > COLLAPSED_ROW_COUNT;
  const visibleRows = expanded || !canExpand ? rows : rows.slice(0, COLLAPSED_ROW_COUNT);

  return (
    <div className="flex flex-col gap-2">
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
          {visibleRows.map((row) => (
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
      {canExpand ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setExpanded(!expanded)}>
          {expanded
            ? translate(locale, "livestock.showLess")
            : `${translate(locale, "livestock.showAll")} (${rows.length})`}
        </Button>
      ) : null}
    </div>
  );
}
