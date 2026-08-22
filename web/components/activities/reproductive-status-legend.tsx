"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

export function ReproductiveStatusLegend({
  distinctValues,
  initialNameMap,
  onChange,
}: {
  distinctValues: string[];
  initialNameMap?: Record<string, string>;
  onChange: (nameMap: Record<string, string>) => void;
}) {
  const [nameMap, setNameMap] = useState<Record<string, string>>(initialNameMap ?? {});

  function handleChange(rawValue: string, name: string) {
    const next = { ...nameMap, [rawValue]: name };
    setNameMap(next);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <p className="text-sm font-medium">A qué estado corresponde cada valor de la columna</p>
      {distinctValues.map((rawValue) => (
        <div key={rawValue} className="flex items-center justify-center gap-2">
          <span className="truncate text-sm">{rawValue}</span>
          <span aria-hidden="true" className="text-muted-foreground">
            →
          </span>
          <Input
            aria-label={`Valor: ${rawValue}`}
            value={nameMap[rawValue] ?? ""}
            onChange={(e) => handleChange(rawValue, e.target.value)}
            className="h-8 w-40 shrink-0"
          />
        </div>
      ))}
    </div>
  );
}
