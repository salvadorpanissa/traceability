import type { ResolvedRow } from "@/lib/activities/transfer";

function statusLabel(row: ResolvedRow): string {
  if (row.status === "existing") return "Existente";
  if (row.status === "new") return "Nuevo";
  return "Error";
}

export function TransferPreviewTable({ rows }: { rows: ResolvedRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="py-1 pr-2">Caravana</th>
          <th className="py-1 pr-2">Estado</th>
          <th className="py-1 pr-2">Detalle</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${row.tag}-${index}`} className="border-b last:border-0">
            <td className="py-1 pr-2">{row.tag}</td>
            <td className="py-1 pr-2">{statusLabel(row)}</td>
            <td className="py-1 pr-2 text-muted-foreground">
              {row.status === "error" ? row.reason : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
