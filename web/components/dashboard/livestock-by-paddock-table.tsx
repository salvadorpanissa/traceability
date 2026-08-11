"use client";

import { translate, type Locale } from "@/lib/i18n/dictionaries";
import { DataTable, type DataTableColumn, type DataTableExtraSheet } from "@/components/ui/data-table";
import { sexLabel } from "@/lib/dashboard/animal-labels";
import type { GroupAnimal, LivestockByPaddockRow } from "@/lib/dashboard/livestock-summary";

function AnimalDetailTable({ animals, locale }: { animals: GroupAnimal[]; locale: Locale }) {
  return (
    <div className="max-h-64 w-full overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-background">
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
    </div>
  );
}

export function LivestockByPaddockTable({ rows, locale }: { rows: LivestockByPaddockRow[]; locale: Locale }) {
  const columns: DataTableColumn<LivestockByPaddockRow>[] = [
    {
      key: "establishment",
      header: translate(locale, "livestock.establishment"),
      render: (row) => row.establishmentName ?? translate(locale, "livestock.noEstablishment"),
      sortValue: (row) => row.establishmentName,
      searchValue: (row) => row.establishmentName ?? "",
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

  const animalSheet: DataTableExtraSheet = {
    name: translate(locale, "livestock.animalsInGroup"),
    headers: [
      translate(locale, "livestock.establishment"),
      translate(locale, "livestock.paddock"),
      translate(locale, "livestock.tag"),
      translate(locale, "animalLookup.secondaryTag"),
      translate(locale, "livestock.category"),
      translate(locale, "animalLookup.sex"),
      translate(locale, "animalLookup.breed"),
      translate(locale, "animalLookup.owner"),
      translate(locale, "animalLookup.birthDate"),
    ],
    rows: rows.flatMap((row) =>
      row.animals.map((animal) => [
        row.establishmentName ?? translate(locale, "livestock.noEstablishment"),
        row.paddockName ?? translate(locale, "livestock.noPaddock"),
        animal.tag,
        animal.secondaryTag,
        animal.categoryName ?? translate(locale, "livestock.noCategory"),
        sexLabel(animal.sex, locale),
        animal.breed,
        animal.ownerName,
        animal.birthDate,
      ])
    ),
  };

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowId={(row) => `${row.establishmentName ?? ""}-${row.paddockName ?? ""}`}
      locale={locale}
      searchable
      exportable
      exportFileName="animales-por-potrero"
      extraSheets={[animalSheet]}
      pageSize={10}
      emptyMessage={translate(locale, "livestock.byPaddockEmpty")}
      expandable
      renderExpanded={(row) => <AnimalDetailTable animals={row.animals} locale={locale} />}
    />
  );
}
