"use client";

import { Button } from "@/components/ui/button";
import type { PaddockMismatch } from "@/lib/activities/health-paddock-mismatch";

export function PaddockMismatchWarning({
  mismatches,
  paddockNameById,
  decision,
  onDecide,
}: {
  mismatches: PaddockMismatch[];
  paddockNameById: Map<string, string>;
  decision: boolean | null;
  onDecide: (transfer: boolean) => void;
}) {
  return (
    <div className="rounded-lg border-2 border-amber-600 bg-amber-100 p-3 text-sm dark:border-amber-600 dark:bg-amber-950">
      <p className="mb-2 font-medium">
        {mismatches.length === 1
          ? "Hay 1 caravana que no está en el potrero elegido para esta sanidad:"
          : `Hay ${mismatches.length} caravanas que no están en el potrero elegido para esta sanidad:`}
      </p>
      <ul className="mb-3 max-h-40 list-disc overflow-y-auto pl-5">
        {mismatches.map((m) => (
          <li key={m.tag}>
            {m.tag} — actualmente en {paddockNameById.get(m.currentPaddockId) ?? "un potrero desconocido"}
          </li>
        ))}
      </ul>
      <p className="mb-2">¿Querés trasladarlas también a este potrero?</p>
      <div className="flex gap-2">
        <Button type="button" variant={decision === true ? "default" : "outline"} onClick={() => onDecide(true)}>
          Sí, trasladarlas también
        </Button>
        <Button type="button" variant={decision === false ? "default" : "outline"} onClick={() => onDecide(false)}>
          No, dejarlas donde están
        </Button>
      </div>
    </div>
  );
}
