"use client";

import { translate, type Locale } from "@/lib/i18n/dictionaries";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import type { LivestockByPaddockRow } from "@/lib/dashboard/livestock-summary";

export function LivestockByPaddockTable({ rows, locale }: { rows: LivestockByPaddockRow[]; locale: Locale }) {
  const columns: DataTableColumn<LivestockByPaddockRow>[] = [
    {
      key: "farm",
      header: translate(locale, "livestock.farm"),
      render: (row) => row.farmName ?? translate(locale, "livestock.noFarm"),
      sortValue: (row) => row.farmName,
      searchValue: (row) => row.farmName ?? "",
    },
    {
      key: "paddock",
      header: translate(locale, "livestock.paddock"),
      render: (row) => row.paddockName ?? translate(locale, "livestock.noPaddock"),
      sortValue: (row) => row.paddockName,
      searchValue: (row) => row.paddockName ?? "",
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
      getRowId={(row) => `${row.farmName ?? ""}-${row.paddockName ?? ""}`}
      locale={locale}
      searchable
      expandable
      exportable
      exportFileName="animales-por-potrero"
      renderExpanded={(row) => (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">{translate(locale, "livestock.animalsInGroup")}</p>
          <p className="text-sm">{row.animals.map((a) => a.tag ?? "—").join(", ")}</p>
        </div>
      )}
      emptyMessage={translate(locale, "livestock.byPaddockEmpty")}
    />
  );
}
