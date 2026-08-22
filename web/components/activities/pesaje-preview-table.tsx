import type { PesajeResolvedRow } from "@/lib/activities/pesaje-resolution";

export function PesajePreviewTable({ rows }: { rows: PesajeResolvedRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="py-1 px-2">Caravana</th>
          <th className="py-1 px-2">Peso (kg)</th>
          <th className="py-1 px-2">Estado</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${row.tag}-${index}`} className="border-b last:border-0">
            <td className="py-1 px-2">{row.tag || "—"}</td>
            <td className="py-1 px-2">
              {row.status === "existing" ? (row.weightKg ?? "A calcular (peso total ÷ cabezas)") : "—"}
            </td>
            <td className="py-1 px-2">
              {row.status === "existing" ? "OK" : <span className="text-destructive">{row.reason}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
