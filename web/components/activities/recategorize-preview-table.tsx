import type { RecategorizeResolvedRow, UnresolvableDecision } from "@/lib/activities/recategorize-resolution";

function SexMismatchSelect({
  tag,
  decision,
  onChange,
}: {
  tag: string;
  decision: UnresolvableDecision;
  onChange: (decision: UnresolvableDecision) => void;
}) {
  return (
    <span>
      <span className="text-muted-foreground">Sexo no coincide</span>{" "}
      <select
        aria-label={`Decisión de sexo para ${tag}`}
        value={decision}
        onChange={(e) => onChange(e.target.value as UnresolvableDecision)}
        className="h-7 rounded-lg border border-border bg-background px-1 text-xs"
      >
        <option value="skip">Omitir</option>
        <option value="assignTarget">Asignar igual</option>
      </select>
    </span>
  );
}

export function RecategorizePreviewTable({
  rows,
  targetCategoryName,
  unresolvableDecisions,
  onDecisionChange,
  sexMismatchAnimalIds,
  sexMismatchDecisions,
  onSexMismatchDecisionChange,
}: {
  rows: RecategorizeResolvedRow[];
  targetCategoryName: string;
  unresolvableDecisions: Record<string, UnresolvableDecision>;
  onDecisionChange: (animalId: string, decision: UnresolvableDecision) => void;
  sexMismatchAnimalIds: Set<string>;
  sexMismatchDecisions: Record<string, UnresolvableDecision>;
  onSexMismatchDecisionChange: (animalId: string, decision: UnresolvableDecision) => void;
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
            const hasSexMismatch = sexMismatchAnimalIds.has(row.animalId);
            const sexDecision = sexMismatchDecisions[row.animalId] ?? "skip";
            const assigning = !hasSexMismatch || sexDecision === "assignTarget";
            return (
              <tr key={`${row.tag}-${index}`} className="border-b last:border-0">
                <td className="py-1 pr-2">{row.tag || "—"}</td>
                <td className="py-1 pr-2">{row.currentCategoryName ?? "—"}</td>
                <td className="py-1 pr-2">{assigning ? targetCategoryName : "—"}</td>
                <td className="py-1 pr-2">
                  {hasSexMismatch ? (
                    <SexMismatchSelect
                      tag={row.tag}
                      decision={sexDecision}
                      onChange={(decision) => onSexMismatchDecisionChange(row.animalId, decision)}
                    />
                  ) : (
                    "OK"
                  )}
                </td>
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
            const hasSexMismatch = sexMismatchAnimalIds.has(row.animalId);
            const sexDecision = sexMismatchDecisions[row.animalId] ?? "skip";
            const assigning = decision === "assignTarget" && (!hasSexMismatch || sexDecision === "assignTarget");
            return (
              <tr key={`${row.tag}-${index}`} className="border-b last:border-0">
                <td className="py-1 pr-2">{row.tag || "—"}</td>
                <td className="py-1 pr-2">Sin categoría</td>
                <td className="py-1 pr-2">{assigning ? targetCategoryName : "—"}</td>
                <td className="py-1 pr-2">
                  <div className="flex flex-col gap-1">
                    <span>
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
                    </span>
                    {hasSexMismatch ? (
                      <SexMismatchSelect
                        tag={row.tag}
                        decision={sexDecision}
                        onChange={(d) => onSexMismatchDecisionChange(row.animalId, d)}
                      />
                    ) : null}
                  </div>
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
