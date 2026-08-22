import type { RecategorizeResolvedRow, UnresolvableDecision } from "@/lib/activities/recategorize-resolution";

export function RecategorizePreviewTable({
  rows,
  targetCategoryNameBySex,
  unresolvableDecisions,
  onDecisionChange,
}: {
  rows: RecategorizeResolvedRow[];
  targetCategoryNameBySex: { male: string | null; female: string | null };
  unresolvableDecisions: Record<string, UnresolvableDecision>;
  onDecisionChange: (animalId: string, decision: UnresolvableDecision) => void;
}) {
  function targetCategoryName(sex: "male" | "female" | null): string | null {
    if (sex === "male") return targetCategoryNameBySex.male;
    if (sex === "female") return targetCategoryNameBySex.female;
    return null;
  }

  return (
    <table className="w-full table-fixed text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="w-[20%] py-1 px-2">Caravana</th>
          <th className="w-[22%] py-1 px-2">Categoría actual</th>
          <th className="w-[22%] py-1 px-2">Categoría nueva</th>
          <th className="w-[36%] py-1 px-2">Estado</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          if (row.status === "existing") {
            const target = targetCategoryName(row.sex);
            return (
              <tr key={`${row.tag}-${index}`} className="border-b last:border-0">
                <td className="py-1 px-2 truncate" title={row.tag || undefined}>{row.tag || "—"}</td>
                <td className="py-1 px-2 truncate" title={row.currentCategoryName ?? undefined}>
                  {row.currentCategoryName ?? "—"}
                </td>
                <td className="py-1 px-2 truncate" title={target ?? undefined}>{target ?? "—"}</td>
                <td className="py-1 px-2 truncate" title={target ? undefined : "Sin categoría destino para este sexo"}>
                  {target ? "OK" : "Sin categoría destino"}
                </td>
              </tr>
            );
          }
          if (row.status === "age-resolved") {
            return (
              <tr key={`${row.tag}-${index}`} className="border-b last:border-0">
                <td className="py-1 px-2">{row.tag || "—"}</td>
                <td className="py-1 px-2">Sin categoría</td>
                <td className="py-1 px-2">{row.resolvedCategoryName}</td>
                <td className="py-1 px-2">OK (por edad)</td>
              </tr>
            );
          }
          if (row.status === "age-unresolvable") {
            const decision = unresolvableDecisions[row.animalId] ?? "skip";
            const target = targetCategoryName(row.sex);
            const assigning = decision === "assignTarget" && !!target;
            return (
              <tr key={`${row.tag}-${index}`} className="border-b last:border-0">
                <td className="py-1 px-2">{row.tag || "—"}</td>
                <td className="py-1 px-2">Sin categoría</td>
                <td className="py-1 px-2">{assigning ? target : "—"}</td>
                <td className="py-1 px-2">
                  <span className="text-muted-foreground">Sin edad calculable</span>{" "}
                  <select
                    aria-label={`Decisión para ${row.tag}`}
                    value={decision}
                    onChange={(e) => onDecisionChange(row.animalId, e.target.value as UnresolvableDecision)}
                    className="h-7 rounded-lg border border-border bg-background px-1 text-xs"
                  >
                    <option value="skip">Omitir</option>
                    <option value="assignTarget">Asignar categoría destino</option>
                  </select>
                </td>
              </tr>
            );
          }
          return (
            <tr key={`${row.tag}-${index}`} className="border-b last:border-0">
              <td className="py-1 px-2">{row.tag || "—"}</td>
              <td className="py-1 px-2">—</td>
              <td className="py-1 px-2">—</td>
              <td className="py-1 px-2">
                <span className="text-destructive">{row.reason}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
