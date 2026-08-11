"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  detectImportMapping,
  type ImportColumnMapping,
  type ImportColumnMeaning,
} from "@/lib/activities/bulk-import-mapping";

const MEANING_LABELS: Record<ImportColumnMeaning, string> = {
  tag: "Caravana",
  secondaryTag: "Chip secundario",
  owner: "Propietario",
  establishment: "Estancia",
  paddock: "Potrero",
  category: "Categoría",
  breed: "Raza",
  sex: "Sexo",
  birthDate: "Fecha de nacimiento",
  eventDate: "Fecha de alta",
  ignore: "Ignorar",
};

const ALL_MEANINGS = Object.keys(MEANING_LABELS) as ImportColumnMeaning[];

export function ImportColumnMapper({
  headers,
  onSubmit,
}: {
  headers: string[];
  onSubmit: (mapping: ImportColumnMapping[]) => void;
}) {
  const [meanings, setMeanings] = useState<Record<string, ImportColumnMeaning>>(() =>
    Object.fromEntries(detectImportMapping(headers).map((m) => [m.header, m.meaning]))
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
            onChange={(e) => setMeanings({ ...meanings, [header]: e.target.value as ImportColumnMeaning })}
            className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
          >
            {ALL_MEANINGS.map((meaning) => (
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
