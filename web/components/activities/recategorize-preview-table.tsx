import type { RecategorizeResolvedRow } from "@/lib/activities/recategorize-resolution";

export function RecategorizePreviewTable({
  rows,
  targetCategoryName,
}: {
  rows: RecategorizeResolvedRow[];
  targetCategoryName: string;
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
        {rows.map((row, index) => (
          <tr key={`${row.tag}-${index}`} className="border-b last:border-0">
            <td className="py-1 pr-2">{row.tag || "—"}</td>
            <td className="py-1 pr-2">{row.status === "existing" ? row.currentCategoryName ?? "—" : "—"}</td>
            <td className="py-1 pr-2">{row.status === "existing" ? targetCategoryName : "—"}</td>
            <td className="py-1 pr-2">
              {row.status === "error" ? <span className="text-destructive">{row.reason}</span> : "OK"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
