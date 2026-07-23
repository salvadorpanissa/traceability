"use client";

import { translate, type Locale } from "@/lib/i18n/dictionaries";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import type { LivestockByCategoryRow } from "@/lib/dashboard/livestock-summary";

export function LivestockByCategoryTable({ rows, locale }: { rows: LivestockByCategoryRow[]; locale: Locale }) {
  const columns: DataTableColumn<LivestockByCategoryRow>[] = [
    {
      key: "category",
      header: translate(locale, "livestock.category"),
      render: (row) => row.categoryName ?? translate(locale, "livestock.noCategory"),
      sortValue: (row) => row.categoryName,
      searchValue: (row) => row.categoryName ?? "",
    },
    {
      key: "count",
      header: translate(locale, "livestock.summaryCount"),
      render: (row) => row.count,
      sortValue: (row) => row.count,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowId={(row) => row.categoryName ?? ""}
      locale={locale}
      searchable
      expandable
      exportable
      exportFileName="animales-por-categoria"
      renderExpanded={(row) => (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">{translate(locale, "livestock.animalsInGroup")}</p>
          <p className="text-sm">{row.animals.map((a) => a.tag ?? "—").join(", ")}</p>
        </div>
      )}
      emptyMessage={translate(locale, "livestock.byCategoryEmpty")}
    />
  );
}
