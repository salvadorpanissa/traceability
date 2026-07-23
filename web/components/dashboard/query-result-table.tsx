import { translate, type Locale } from "@/lib/i18n/dictionaries";

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export function QueryResultTable({
  columns,
  rows,
  locale,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  locale: Locale;
}) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground">{translate(locale, "nlQuery.emptyResults")}</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          {columns.map((column) => (
            <th key={column} className="py-1 pr-2">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index} className="border-b last:border-0">
            {columns.map((column) => (
              <td key={column} className="py-1 pr-2">
                {formatCellValue(row[column])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
