"use client";

import { translate, type Locale } from "@/lib/i18n/dictionaries";
import { friendlyColumnLabel } from "@/lib/dal/reporting/column-labels";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function sortableValue(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return String(value);
}

type IndexedRow = { id: string; data: Record<string, unknown> };

export function QueryResultTable({
  columns,
  rows,
  locale,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  locale: Locale;
}) {
  const indexedRows: IndexedRow[] = rows.map((data, index) => ({ id: String(index), data }));

  const dataTableColumns: DataTableColumn<IndexedRow>[] = columns.map((column) => ({
    key: column,
    header: friendlyColumnLabel(column, locale),
    render: (row) => formatCellValue(row.data[column]),
    sortValue: (row) => sortableValue(row.data[column]),
    searchValue: (row) => formatCellValue(row.data[column]).toLowerCase(),
    exportValue: (row) => {
      const value = row.data[column];
      return typeof value === "string" || typeof value === "number" ? value : formatCellValue(value);
    },
  }));

  return (
    <DataTable
      columns={dataTableColumns}
      rows={indexedRows}
      getRowId={(row) => row.id}
      locale={locale}
      searchable
      exportable
      exportFileName="consulta"
      emptyMessage={translate(locale, "nlQuery.emptyResults")}
    />
  );
}
