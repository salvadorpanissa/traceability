"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { translate, type Locale, type TranslationKey } from "@/lib/i18n/dictionaries";
import { getStaleTagsAction } from "@/app/(protected)/dashboard/stale-tags-actions";
import type { StaleTagRow } from "@/lib/dashboard/stale-tag-summary";

const THRESHOLD_OPTIONS = [90, 100, 120, 150] as const;

const EVENT_TYPE_LABEL_KEYS: Record<string, TranslationKey> = {
  transfer: "eventType.transfer",
  health: "eventType.health",
  retag: "eventType.retag",
  recategorize: "eventType.recategorize",
  sale: "eventType.sale",
  death: "eventType.death",
};

function lastEventLabel(row: StaleTagRow, locale: Locale): string {
  if (!row.lastEventType) return translate(locale, "dashboard.staleTagsNoEvents");
  const key = EVENT_TYPE_LABEL_KEYS[row.lastEventType];
  const label = key ? translate(locale, key) : row.lastEventType;
  return `${label} · ${row.lastEventDate}`;
}

export function StaleTagAlerts({
  initialRows,
  initialThreshold,
  locale,
}: {
  initialRows: StaleTagRow[];
  initialThreshold: number;
  locale: Locale;
}) {
  const [threshold, setThreshold] = useState(initialThreshold);
  const [rows, setRows] = useState(initialRows);
  const [, startTransition] = useTransition();

  function handleThresholdChange(value: number) {
    setThreshold(value);
    startTransition(async () => {
      const nextRows = await getStaleTagsAction(value);
      setRows(nextRows);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Label htmlFor="stale-tags-threshold">{translate(locale, "dashboard.staleTagsThresholdLabel")}</Label>
        <select
          id="stale-tags-threshold"
          className="rounded-md border bg-background px-2 py-1 text-sm"
          value={threshold}
          onChange={(e) => handleThresholdChange(Number(e.target.value))}
        >
          {THRESHOLD_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option} {translate(locale, "dashboard.staleTagsThresholdSuffix")}
            </option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <Card size="sm">
          <CardContent className="pt-(--card-spacing)">
            <p className="text-sm text-muted-foreground">{translate(locale, "dashboard.staleTagsEmpty")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <Card key={row.animalId} size="sm">
              <CardContent className="pt-(--card-spacing)">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="font-medium text-sm">{row.currentTag}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.establishmentName ?? ""}
                      {row.paddockName ? ` • ${row.paddockName}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">{lastEventLabel(row, locale)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-xs text-muted-foreground">
                      {row.daysSinceLastEvent} {translate(locale, "dashboard.staleTagsDaysSuffix")}
                    </span>
                    <Link
                      href={`/activities/death?tag=${encodeURIComponent(row.currentTag ?? "")}`}
                      className="text-sm underline"
                    >
                      {translate(locale, "animalLookup.registerDeath")}
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
