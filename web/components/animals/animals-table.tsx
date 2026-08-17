"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { translate, type Locale } from "@/lib/i18n/dictionaries";
import { DataTable, type DataTableColumn, type DataTableFilter } from "@/components/ui/data-table";
import { sexLabel, statusLabel } from "@/lib/dashboard/animal-labels";
import type { AnimalLookupDetail } from "@/lib/dal/animal-access";

const PAGE_SIZE = 100;

export function AnimalsTable({ rows, locale }: { rows: AnimalLookupDetail[]; locale: Locale }) {
  const columns: DataTableColumn<AnimalLookupDetail>[] = [
    {
      key: "tag",
      header: translate(locale, "livestock.tag"),
      render: (row) => row.currentTag ?? "—",
      searchValue: (row) => row.currentTag ?? "",
      width: "w-36",
    },
    {
      key: "secondaryTag",
      header: translate(locale, "animalLookup.secondaryTag"),
      render: (row) => row.secondaryTag ?? "—",
      width: "w-28",
    },
    {
      key: "category",
      header: translate(locale, "livestock.category"),
      render: (row) => row.categoryName ?? translate(locale, "livestock.noCategory"),
      width: "w-32",
    },
    {
      key: "establishment",
      header: translate(locale, "livestock.establishment"),
      render: (row) => row.establishmentName ?? translate(locale, "livestock.noEstablishment"),
      width: "w-32",
    },
    {
      key: "paddock",
      header: translate(locale, "livestock.paddock"),
      render: (row) => row.paddockName ?? translate(locale, "livestock.noPaddock"),
      width: "w-32",
    },
    {
      key: "status",
      header: translate(locale, "animalLookup.status"),
      render: (row) => statusLabel(row.status, locale),
      width: "w-24",
    },
    {
      key: "sex",
      header: translate(locale, "animalLookup.sex"),
      render: (row) => sexLabel(row.sex, locale),
      width: "w-20",
    },
    {
      key: "breed",
      header: translate(locale, "animalLookup.breed"),
      render: (row) => row.breed ?? "—",
      width: "w-28",
    },
    {
      key: "reproductiveStatus",
      header: translate(locale, "animalLookup.reproductiveStatus"),
      render: (row) => row.reproductiveStatusName ?? translate(locale, "animalLookup.noReproductiveStatus"),
      width: "w-32",
    },
    {
      key: "owner",
      header: translate(locale, "animalLookup.owner"),
      render: (row) => row.ownerName ?? "—",
      searchValue: (row) => row.ownerName ?? "",
      width: "w-28",
    },
    {
      key: "birthDate",
      header: translate(locale, "animalLookup.birthDate"),
      render: (row) => row.birthDate ?? "—",
      sortValue: (row) => row.birthDate,
      width: "w-28",
    },
    {
      key: "actions",
      header: translate(locale, "animals.actions"),
      render: (row) => (
        <Button size="sm" variant="ghost" render={<Link href={`/animals/${row.animalId}`} />} nativeButton={false}>
          {translate(locale, "animals.edit")}
        </Button>
      ),
      width: "w-20",
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
    {
      key: "reproductiveStatus",
      label: translate(locale, "animalLookup.reproductiveStatus"),
      value: (row) => row.reproductiveStatusName ?? "",
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
