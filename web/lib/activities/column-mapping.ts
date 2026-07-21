export type ColumnMeaning = "tag" | "date" | "category" | "product" | "ignore";

export type ColumnMapping = {
  header: string;
  meaning: ColumnMeaning;
};

export type MappedRow = {
  tag: string;
  date: string | null;
  category: string | null;
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

  return rows.map((row) => ({
    tag: tagIndex >= 0 ? (row[tagIndex] ?? "") : "",
    date: dateIndex >= 0 ? (row[dateIndex] ?? null) : null,
    category: categoryIndex >= 0 ? (row[categoryIndex] || null) : null,
  }));
}
