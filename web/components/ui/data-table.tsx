"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { translate, type Locale } from "@/lib/i18n/dictionaries";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  // Omit to make the column unsortable.
  sortValue?: (row: T) => string | number | null;
  // Omit to exclude the column from the search filter.
  searchValue?: (row: T) => string;
  // Value written to the exported Excel cell. Falls back to sortValue, then
  // searchValue, since either is already a plain string/number in most columns.
  exportValue?: (row: T) => string | number | null;
};

// An extra Excel sheet exported alongside the main table — e.g. the
// animal-level detail behind each summary row, so the download isn't
// limited to whatever's currently expanded on screen.
export type DataTableExtraSheet = {
  name: string;
  headers: string[];
  rows: (string | number | null)[][];
};

// A dropdown filter for one column: options are the distinct values of
// `value` across all rows, so callers don't have to keep an options list in
// sync with the data by hand.
export type DataTableFilter<T> = {
  key: string;
  label: string;
  value: (row: T) => string;
  // Key of another filter this one is scoped under (e.g. potrero depends on
  // campo): its options are narrowed to rows matching the parent's current
  // selection. One-directional on purpose — the reverse (parent narrowed by
  // child) traps the user, since picking a child would lock out every other
  // parent value.
  dependsOn?: string;
};

type SortState = { key: string; direction: "asc" | "desc" };

function compareValues(a: string | number | null, b: string | number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

// Current page plus its next 3, then (if there's a real gap) an ellipsis
// before the last page — instead of one button per page, which is unusable
// once there are dozens of pages.
function paginationItems(current: number, totalPages: number): (number | "ellipsis")[] {
  const items: (number | "ellipsis")[] = [];
  const windowEnd = Math.min(current + 3, totalPages - 1);
  for (let page = current; page <= windowEnd; page++) items.push(page);
  if (windowEnd < totalPages - 1) {
    if (windowEnd < totalPages - 2) items.push("ellipsis");
    items.push(totalPages - 1);
  }
  return items;
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  locale,
  searchable = false,
  searchPlaceholder,
  expandable = false,
  renderExpanded,
  pageSize,
  emptyMessage,
  exportable = false,
  exportFileName = "tabla",
  exportSheetName = "Datos",
  extraSheets,
  filters,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  locale: Locale;
  searchable?: boolean;
  searchPlaceholder?: string;
  expandable?: boolean;
  renderExpanded?: (row: T) => React.ReactNode;
  pageSize?: number;
  emptyMessage?: string;
  exportable?: boolean;
  exportFileName?: string;
  exportSheetName?: string;
  extraSheets?: DataTableExtraSheet[];
  filters?: DataTableFilter<T>[];
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(0);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});

  const columnByKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);

  // A filter with `dependsOn` gets its options from rows narrowed to the
  // parent filter's current selection; every other filter's options come
  // from the full row set.
  const filterOptions = useMemo(() => {
    const options: Record<string, string[]> = {};
    for (const filter of filters ?? []) {
      let base = rows;
      const parent = filters?.find((f) => f.key === filter.dependsOn);
      const parentSelected = filter.dependsOn ? filterValues[filter.dependsOn] : undefined;
      if (parent && parentSelected) base = base.filter((row) => parent.value(row) === parentSelected);
      options[filter.key] = Array.from(new Set(base.map(filter.value).filter((v) => v !== ""))).sort();
    }
    return options;
  }, [rows, filters, filterValues]);

  const filteredRows = useMemo(() => {
    let result = rows;
    for (const filter of filters ?? []) {
      const selected = filterValues[filter.key];
      if (selected) result = result.filter((row) => filter.value(row) === selected);
    }
    if (searchable && query.trim().length > 0) {
      const needle = query.trim().toLowerCase();
      result = result.filter((row) =>
        columns.some((column) => column.searchValue?.(row).toLowerCase().includes(needle))
      );
    }
    return result;
  }, [rows, columns, searchable, query, filters, filterValues]);

  const sortedRows = useMemo(() => {
    if (!sort) return filteredRows;
    const column = columnByKey.get(sort.key);
    if (!column?.sortValue) return filteredRows;
    const sign = sort.direction === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => sign * compareValues(column.sortValue!(a), column.sortValue!(b)));
  }, [filteredRows, sort, columnByKey]);

  const totalPages = pageSize ? Math.max(1, Math.ceil(sortedRows.length / pageSize)) : 1;
  const safePage = Math.min(currentPage, totalPages - 1);
  const pageStart = pageSize ? safePage * pageSize : 0;
  const pageEnd = pageSize ? Math.min(pageStart + pageSize, sortedRows.length) : sortedRows.length;
  const visibleRows = pageSize ? sortedRows.slice(pageStart, pageEnd) : sortedRows;

  function handleSearchChange(value: string) {
    setQuery(value);
    setCurrentPage(0);
  }

  function handleFilterChange(key: string, value: string) {
    setFilterValues((prev) => {
      const next = { ...prev, [key]: value };
      // Changing a parent filter can strand a dependent filter's selection
      // outside its new (narrower) options — e.g. picking a different campo
      // while a potrero from the old campo is still selected.
      for (const filter of filters ?? []) {
        if (filter.dependsOn !== key || !next[filter.key]) continue;
        const parent = filters?.find((f) => f.key === key);
        const scoped = parent && value ? rows.filter((row) => parent.value(row) === value) : rows;
        const stillValid = scoped.some((row) => filter.value(row) === next[filter.key]);
        if (!stillValid) next[filter.key] = "";
      }
      return next;
    });
    setCurrentPage(0);
  }

  function handleSort(column: DataTableColumn<T>) {
    if (!column.sortValue) return;
    setSort((prev) => {
      if (prev?.key !== column.key) return { key: column.key, direction: "asc" };
      if (prev.direction === "asc") return { key: column.key, direction: "desc" };
      return null;
    });
    setCurrentPage(0);
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleExport() {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(exportSheetName);
    sheet.addRow(columns.map((column) => column.header));
    for (const row of sortedRows) {
      sheet.addRow(
        columns.map((column) => column.exportValue?.(row) ?? column.sortValue?.(row) ?? column.searchValue?.(row) ?? "")
      );
    }
    for (const extraSheet of extraSheets ?? []) {
      const worksheet = workbook.addWorksheet(extraSheet.name);
      worksheet.addRow(extraSheet.headers);
      for (const row of extraSheet.rows) worksheet.addRow(row);
    }
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${exportFileName}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const colSpan = columns.length + (expandable ? 1 : 0);
  const showingFrom = pageStart + 1;
  const showingTo = pageEnd;

  return (
    <div className="flex flex-col gap-2">
      {searchable || exportable || filters?.length ? (
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
          {searchable ? (
            <Input
              value={query}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={searchPlaceholder ?? translate(locale, "dataTable.searchPlaceholder")}
              aria-label={searchPlaceholder ?? translate(locale, "dataTable.searchPlaceholder")}
              className="w-56 shrink-0"
            />
          ) : null}
          {(filters ?? []).map((filter) => (
            <select
              key={filter.key}
              value={filterValues[filter.key] ?? ""}
              onChange={(e) => handleFilterChange(filter.key, e.target.value)}
              aria-label={filter.label}
              className="h-9 shrink-0 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">
                {filter.label} · {translate(locale, "dataTable.allOption")}
              </option>
              {filterOptions[filter.key]?.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ))}
          {exportable ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={sortedRows.length === 0}
              onClick={handleExport}
              className="ml-auto shrink-0"
            >
              <Download className="size-4" />
              {translate(locale, "dataTable.downloadExcel")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {sortedRows.length === 0 ? (
        <p className="text-muted-foreground">{emptyMessage ?? translate(locale, "dataTable.empty")}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  {expandable ? <th className="w-8 py-1" /> : null}
                  {columns.map((column) => (
                    <th key={column.key} className="py-1 pr-2">
                      {column.sortValue ? (
                        <button
                          type="button"
                          onClick={() => handleSort(column)}
                          className="inline-flex items-center gap-1 font-medium hover:text-foreground"
                        >
                          {column.header}
                          <span className="text-xs text-muted-foreground">
                            {sort?.key === column.key ? (sort.direction === "asc" ? "▲" : "▼") : ""}
                          </span>
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const id = getRowId(row);
                  const isExpanded = expandedIds.has(id);
                  return (
                    <Fragment key={id}>
                      <tr className="border-b last:border-0">
                        {expandable ? (
                          <td className="py-1">
                            <button
                              type="button"
                              aria-label={
                                isExpanded ? translate(locale, "dataTable.collapse") : translate(locale, "dataTable.expand")
                              }
                              aria-expanded={isExpanded}
                              onClick={() => toggleExpanded(id)}
                              className="flex size-5 items-center justify-center text-muted-foreground hover:text-foreground"
                            >
                              {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                            </button>
                          </td>
                        ) : null}
                        {columns.map((column) => (
                          <td key={column.key} className="py-1 pr-2">
                            {column.render(row)}
                          </td>
                        ))}
                      </tr>
                      {expandable && isExpanded ? (
                        <tr className="border-b bg-muted/30 last:border-0">
                          <td colSpan={colSpan} className="p-2">
                            {renderExpanded?.(row)}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pageSize && sortedRows.length > pageSize ? (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Mostrando {showingFrom}–{showingTo} de {sortedRows.length}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  disabled={safePage === 0}
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                {paginationItems(safePage, totalPages).map((item, index) =>
                  item === "ellipsis" ? (
                    <span key={`ellipsis-${index}`} className="px-1 text-muted-foreground">
                      …
                    </span>
                  ) : (
                    <Button
                      key={item}
                      type="button"
                      variant={item === safePage ? "default" : "outline"}
                      size="icon-xs"
                      onClick={() => setCurrentPage(item)}
                      aria-label={`Página ${item + 1}`}
                      aria-current={item === safePage ? "page" : undefined}
                    >
                      {item + 1}
                    </Button>
                  )
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  disabled={safePage >= totalPages - 1}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                  aria-label="Página siguiente"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
