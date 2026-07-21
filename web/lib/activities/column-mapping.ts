export type ColumnMeaning = "tag" | "date" | "category" | "product" | "sex" | "owner" | "ignore";

export type ColumnMapping = {
  header: string;
  meaning: ColumnMeaning;
};

export type MappedRow = {
  tag: string;
  date: string | null;
  category: string | null;
  sex: string | null;
  ownerName: string | null;
};

export function computeHeaderSignature(headers: string[]): string {
  return JSON.stringify(headers);
}

function columnIndexFor(headers: string[], mapping: ColumnMapping[], meaning: ColumnMeaning): number {
  const mapped = mapping.find((m) => m.meaning === meaning);
  if (!mapped) return -1;
  return headers.indexOf(mapped.header);
}

export function applyColumnMapping(headers: string[], rows: string[][], mapping: ColumnMapping[]): MappedRow[] {
  const tagIndex = columnIndexFor(headers, mapping, "tag");
  const dateIndex = columnIndexFor(headers, mapping, "date");
  const categoryIndex = columnIndexFor(headers, mapping, "category");
  const sexIndex = columnIndexFor(headers, mapping, "sex");
  const ownerIndex = columnIndexFor(headers, mapping, "owner");

  return rows.map((row) => ({
    tag: tagIndex >= 0 ? (row[tagIndex] ?? "") : "",
    date: dateIndex >= 0 ? (row[dateIndex] ?? null) : null,
    category: categoryIndex >= 0 ? (row[categoryIndex] || null) : null,
    sex: sexIndex >= 0 ? (row[sexIndex] || null) : null,
    ownerName: ownerIndex >= 0 ? (row[ownerIndex] || null) : null,
  }));
}

export function extractProductColumnValues(headers: string[], rows: string[][], mapping: ColumnMapping[]): string[] {
  const productColumns = mapping.filter((m) => m.meaning === "product");
  const values: string[] = [];

  for (const column of productColumns) {
    const index = headers.indexOf(column.header);
    if (index < 0) continue;
    const firstNonEmpty = rows.map((row) => row[index]).find((value) => value && value.trim().length > 0);
    if (firstNonEmpty) {
      values.push(firstNonEmpty.trim());
    }
  }

  return values;
}
