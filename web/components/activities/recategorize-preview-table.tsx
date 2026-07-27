import type { RecategorizeResolvedRow, UnresolvableDecision } from "@/lib/activities/recategorize-resolution";

export function RecategorizePreviewTable({
  rows,
  targetCategoryName,
  unresolvableDecisions,
  onDecisionChange,
}: {
  rows: RecategorizeResolvedRow[];
  targetCategoryName: string;
  unresolvableDecisions: Record<string, UnresolvableDecision>;
  onDecisionChange: (animalId: string, decision: UnresolvableDecision) => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="py-1 pr-2">Caravana</th>
          <th className="py-1 pr-2">Categoría actual</th>
          <th className="py-1 pr-2">Categoría nueva</th>
          <th className="py-1 pr-2">Estado</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          if (row.status === "existing") {
            return (
              <tr key={`${row.tag}-${index}`} className="border-b last:border-0">
                <td className="py-1 pr-2">{row.tag || "—"}</td>
                <td className="py-1 pr-2">{row.currentCategoryName ?? "—"}</td>
                <td className="py-1 pr-2">{targetCategoryName}</td>
                <td className="py-1 pr-2">OK</td>
              </tr>
            );
          }
          if (row.status === "age-resolved") {
            return (
              <tr key={`${row.tag}-${index}`} className="border-b last:border-0">
                <td className="py-1 pr-2">{row.tag || "—"}</td>
                <td className="py-1 pr-2">Sin categoría</td>
                <td className="py-1 pr-2">{row.resolvedCategoryName}</td>
                <td className="py-1 pr-2">OK (por edad)</td>
              </tr>
            );
          }
          if (row.status === "age-unresolvable") {
            const decision = unresolvableDecisions[row.animalId] ?? "skip";
            return (
              <tr key={`${row.tag}-${index}`} className="border-b last:border-0">
                <td className="py-1 pr-2">{row.tag || "—"}</td>
                <td className="py-1 pr-2">Sin categoría</td>
                <td className="py-1 pr-2">{decision === "assignTarget" ? targetCategoryName : "—"}</td>
                <td className="py-1 pr-2">
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
              <td className="py-1 pr-2">{row.tag || "—"}</td>
              <td className="py-1 pr-2">—</td>
              <td className="py-1 pr-2">—</td>
              <td className="py-1 pr-2">
                <span className="text-destructive">{row.reason}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
