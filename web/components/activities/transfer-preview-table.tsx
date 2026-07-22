import type { ResolvedRow } from "@/lib/activities/transfer";

function statusLabel(row: ResolvedRow): string {
  if (row.status === "existing") return "Existente";
  if (row.status === "new") return "Nuevo";
  if (row.status === "wrong_farm") return "Campo incorrecto";
  if (row.status === "foreign") return "Ajena";
  return "Error";
}

function detailText(row: ResolvedRow): string | null {
  if (row.status === "error") return row.reason;
  if (row.status === "new" && row.pendingOwnerName) return `Propietario pendiente: ${row.pendingOwnerName}`;
  if (row.status === "wrong_farm") return `Registrada en ${row.registeredFarmName} — verificar pastoreo`;
  if (row.status === "foreign" && row.pendingOwnerName) return `Propietario pendiente: ${row.pendingOwnerName}`;
  return null;
}

export function TransferPreviewTable({
  rows,
  onToggleForced,
}: {
  rows: ResolvedRow[];
  onToggleForced: (tag: string) => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="py-1 pr-2">Caravana</th>
          <th className="py-1 pr-2">Estado</th>
          <th className="py-1 pr-2">Detalle</th>
          <th className="py-1 pr-2"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${row.tag}-${index}`} className="border-b last:border-0">
            <td className="py-1 pr-2">{row.tag}</td>
            <td className="py-1 pr-2">{statusLabel(row)}</td>
            <td className="py-1 pr-2 text-muted-foreground">{detailText(row)}</td>
            <td className="py-1 pr-2">
              {row.status === "foreign" ? (
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={row.forced} onChange={() => onToggleForced(row.tag)} />
                  Es mía de todos modos
                </label>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
