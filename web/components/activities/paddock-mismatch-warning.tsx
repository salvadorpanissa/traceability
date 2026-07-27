"use client";

import { Button } from "@/components/ui/button";
import type { PaddockMismatch } from "@/lib/activities/health";

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
    <div className="rounded-lg border border-amber-500 bg-amber-50 p-3 text-sm dark:bg-amber-950">
      <p className="mb-2 font-medium">
        {mismatches.length === 1
          ? "Hay 1 caravana que no está en el potrero elegido para esta sanidad:"
          : `Hay ${mismatches.length} caravanas que no están en el potrero elegido para esta sanidad:`}
      </p>
      <ul className="mb-3 list-disc pl-5">
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
