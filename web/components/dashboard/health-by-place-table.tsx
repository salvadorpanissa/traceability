"use client";

import { useState, useTransition } from "react";
import { translate, type Locale } from "@/lib/i18n/dictionaries";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { loadHealthByPlaceAction } from "@/app/(protected)/dashboard/health-summary-actions";
import type { HealthByPlaceRow } from "@/lib/dashboard/health-place-summary";

const MONTH_OPTIONS = [1, 3, 6, 12];

export function HealthByPlaceTable({
  initialRows,
  initialMonths,
  locale,
}: {
  initialRows: HealthByPlaceRow[];
  initialMonths: number;
  locale: Locale;
}) {
  const [months, setMonths] = useState(initialMonths);
  const [rows, setRows] = useState(initialRows);
  const [isPending, startTransition] = useTransition();

  function handleMonthsChange(value: number) {
    setMonths(value);
    startTransition(async () => {
      setRows(await loadHealthByPlaceAction(value));
    });
  }

  const columns: DataTableColumn<HealthByPlaceRow>[] = [
    {
      key: "farm",
      header: translate(locale, "livestock.farm"),
      render: (row) => row.farmName,
      sortValue: (row) => row.farmName,
      searchValue: (row) => row.farmName,
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
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm">
        <label htmlFor="health-by-place-months">{translate(locale, "healthByPlace.months")}</label>
        <select
          id="health-by-place-months"
          aria-label={translate(locale, "healthByPlace.months")}
          value={months}
          onChange={(e) => handleMonthsChange(Number(e.target.value))}
          className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
        >
          {MONTH_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <span>{translate(locale, "healthByPlace.monthsSuffix")}</span>
        {isPending ? <span className="text-muted-foreground">…</span> : null}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(row) => `${row.farmName}-${row.paddockName ?? ""}`}
        locale={locale}
        searchable
        expandable
        exportable
        exportFileName="sanidades-por-lugar"
        renderExpanded={(row) => (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground">{translate(locale, "healthByPlace.eventsInGroup")}</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="py-1 pr-2">{translate(locale, "healthByPlace.date")}</th>
                  <th className="py-1 pr-2">{translate(locale, "healthByPlace.tag")}</th>
                  <th className="py-1 pr-2">{translate(locale, "healthByPlace.product")}</th>
                </tr>
              </thead>
              <tbody>
                {row.events.map((healthEvent) => (
                  <tr key={healthEvent.eventId}>
                    <td className="py-1 pr-2">{healthEvent.eventDate}</td>
                    <td className="py-1 pr-2">{healthEvent.animalTag ?? "—"}</td>
                    <td className="py-1 pr-2">{healthEvent.productName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        emptyMessage={translate(locale, "healthByPlace.empty")}
      />
    </div>
  );
}
