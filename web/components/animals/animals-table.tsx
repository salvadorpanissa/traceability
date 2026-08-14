"use client";

import { useState } from "react";
import { translate, type Locale } from "@/lib/i18n/dictionaries";
import { DataTable, type DataTableColumn, type DataTableFilter } from "@/components/ui/data-table";
import { sexLabel, statusLabel } from "@/lib/dashboard/animal-labels";
import { AnimalEditDialog } from "@/components/animals/animal-edit-dialog";
import type { AnimalLookupDetail } from "@/lib/dal/animal-access";
import type { OwnerCatalogEntry } from "@/lib/dal/owner-catalog";
import type { CategoryCatalogEntry } from "@/lib/dal/category-catalog";

const PAGE_SIZE = 100;

export function AnimalsTable({
  rows: initialRows,
  owners,
  categoriesByEstablishmentId,
  locale,
}: {
  rows: AnimalLookupDetail[];
  owners: OwnerCatalogEntry[];
  categoriesByEstablishmentId: Record<string, CategoryCatalogEntry[]>;
  locale: Locale;
}) {
  const [rows, setRows] = useState(initialRows);

  function handleSaved(updated: AnimalLookupDetail) {
    setRows((prev) => prev.map((row) => (row.animalId === updated.animalId ? updated : row)));
  }

  const columns: DataTableColumn<AnimalLookupDetail>[] = [
    {
      key: "tag",
      header: translate(locale, "livestock.tag"),
      render: (row) => row.currentTag ?? "—",
      sortValue: (row) => row.currentTag,
      searchValue: (row) => row.currentTag ?? "",
    },
    {
      key: "secondaryTag",
      header: translate(locale, "animalLookup.secondaryTag"),
      render: (row) => row.secondaryTag ?? "—",
      sortValue: (row) => row.secondaryTag,
    },
    {
      key: "category",
      header: translate(locale, "livestock.category"),
      render: (row) => row.categoryName ?? translate(locale, "livestock.noCategory"),
      sortValue: (row) => row.categoryName,
    },
    {
      key: "establishment",
      header: translate(locale, "livestock.establishment"),
      render: (row) => row.establishmentName ?? translate(locale, "livestock.noEstablishment"),
      sortValue: (row) => row.establishmentName,
    },
    {
      key: "paddock",
      header: translate(locale, "livestock.paddock"),
      render: (row) => row.paddockName ?? translate(locale, "livestock.noPaddock"),
      sortValue: (row) => row.paddockName,
    },
    {
      key: "status",
      header: translate(locale, "animalLookup.status"),
      render: (row) => statusLabel(row.status, locale),
      sortValue: (row) => statusLabel(row.status, locale),
    },
    {
      key: "sex",
      header: translate(locale, "animalLookup.sex"),
      render: (row) => sexLabel(row.sex, locale),
      sortValue: (row) => sexLabel(row.sex, locale),
    },
    {
      key: "breed",
      header: translate(locale, "animalLookup.breed"),
      render: (row) => row.breed ?? "—",
      sortValue: (row) => row.breed,
    },
    {
      key: "owner",
      header: translate(locale, "animalLookup.owner"),
      render: (row) => row.ownerName ?? "—",
      sortValue: (row) => row.ownerName,
      searchValue: (row) => row.ownerName ?? "",
    },
    {
      key: "birthDate",
      header: translate(locale, "animalLookup.birthDate"),
      render: (row) => row.birthDate ?? "—",
      sortValue: (row) => row.birthDate,
    },
    {
      key: "actions",
      header: translate(locale, "animals.actions"),
      render: (row) => (
        <AnimalEditDialog
          animal={row}
          owners={owners}
          categories={categoriesByEstablishmentId[row.currentEstablishmentId ?? ""] ?? []}
          locale={locale}
          onSaved={handleSaved}
        />
      ),
    },
  ];

  const filters: DataTableFilter<AnimalLookupDetail>[] = [
    {
      key: "status",
      label: translate(locale, "animalLookup.status"),
      value: (row) => statusLabel(row.status, locale),
    },
    {
      key: "category",
      label: translate(locale, "livestock.category"),
      value: (row) => row.categoryName ?? "",
    },
    {
      key: "establishment",
      label: translate(locale, "livestock.establishment"),
      value: (row) => row.establishmentName ?? "",
    },
    {
      key: "paddock",
      label: translate(locale, "livestock.paddock"),
      value: (row) => row.paddockName ?? "",
      dependsOn: "establishment",
    },
    {
      key: "sex",
      label: translate(locale, "animalLookup.sex"),
      value: (row) => sexLabel(row.sex, locale),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowId={(row) => row.animalId}
      locale={locale}
      searchable
      searchPlaceholder={translate(locale, "animals.searchPlaceholder")}
      exportable
      exportFileName="animales"
      pageSize={PAGE_SIZE}
      filters={filters}
      emptyMessage={translate(locale, "animals.empty")}
    />
  );
}
