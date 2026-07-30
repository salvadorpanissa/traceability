"use client";

import { translate, type Locale } from "@/lib/i18n/dictionaries";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { sexLabel } from "@/lib/dashboard/animal-labels";
import type { GroupAnimal, LivestockByPaddockRow } from "@/lib/dashboard/livestock-summary";

function AnimalDetailTable({ animals, locale }: { animals: GroupAnimal[]; locale: Locale }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="py-1 pr-2">{translate(locale, "livestock.tag")}</th>
          <th className="py-1 pr-2">{translate(locale, "animalLookup.secondaryTag")}</th>
          <th className="py-1 pr-2">{translate(locale, "livestock.category")}</th>
          <th className="py-1 pr-2">{translate(locale, "animalLookup.sex")}</th>
          <th className="py-1 pr-2">{translate(locale, "animalLookup.breed")}</th>
          <th className="py-1 pr-2">{translate(locale, "animalLookup.owner")}</th>
          <th className="py-1 pr-2">{translate(locale, "animalLookup.birthDate")}</th>
        </tr>
      </thead>
      <tbody>
        {animals.map((animal) => (
          <tr key={animal.animalId} className="border-b last:border-0">
            <td className="py-1 pr-2">{animal.tag ?? "—"}</td>
            <td className="py-1 pr-2">{animal.secondaryTag ?? "—"}</td>
            <td className="py-1 pr-2">{animal.categoryName ?? translate(locale, "livestock.noCategory")}</td>
            <td className="py-1 pr-2">{sexLabel(animal.sex, locale)}</td>
            <td className="py-1 pr-2">{animal.breed ?? "—"}</td>
            <td className="py-1 pr-2">{animal.ownerName ?? "—"}</td>
            <td className="py-1 pr-2">{animal.birthDate ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

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
      exportable
      exportFileName="animales-por-potrero"
      pageSize={10}
      emptyMessage={translate(locale, "livestock.byPaddockEmpty")}
      expandable
      renderExpanded={(row) => <AnimalDetailTable animals={row.animals} locale={locale} />}
    />
  );
}
