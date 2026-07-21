"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ColumnMapping, ColumnMeaning } from "@/lib/activities/column-mapping";

const MEANING_LABELS: Record<ColumnMeaning, string> = {
  tag: "Caravana",
  date: "Fecha",
  category: "Categoría",
  product: "Producto",
  ignore: "Ignorar",
};

const DEFAULT_MEANINGS: ColumnMeaning[] = ["tag", "date", "category", "ignore"];

export function ColumnMapper({
  headers,
  availableMeanings = DEFAULT_MEANINGS,
  initialMapping,
  onSubmit,
}: {
  headers: string[];
  availableMeanings?: ColumnMeaning[];
  initialMapping?: ColumnMapping[] | null;
  onSubmit: (mapping: ColumnMapping[]) => void;
}) {
  const [meanings, setMeanings] = useState<Record<string, ColumnMeaning>>(() =>
    Object.fromEntries(
      headers.map((h) => [h, initialMapping?.find((m) => m.header === h)?.meaning ?? "ignore"])
    )
  );

  const hasTag = Object.values(meanings).filter((m) => m === "tag").length === 1;

  return (
    <div className="flex flex-col gap-3">
      {headers.map((header) => (
        <div key={header} className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{header}</span>
          <select
            aria-label={header}
            value={meanings[header]}
            onChange={(e) => setMeanings({ ...meanings, [header]: e.target.value as ColumnMeaning })}
            className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
          >
            {availableMeanings.map((meaning) => (
              <option key={meaning} value={meaning}>
                {MEANING_LABELS[meaning]}
              </option>
            ))}
          </select>
        </div>
      ))}
      <Button
        type="button"
        disabled={!hasTag}
        onClick={() => onSubmit(headers.map((header) => ({ header, meaning: meanings[header] })))}
      >
        Continuar
      </Button>
    </div>
  );
}
