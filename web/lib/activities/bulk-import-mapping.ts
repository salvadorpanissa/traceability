export type ImportColumnMeaning =
  | "tag"
  | "secondaryTag"
  | "owner"
  | "establishment"
  | "paddock"
  | "category"
  | "breed"
  | "sex"
  | "birthDate"
  | "eventDate"
  | "ignore";

export type ImportColumnMapping = {
  header: string;
  meaning: ImportColumnMeaning;
};

export type MappedImportRow = {
  tag: string;
  secondaryTag: string | null;
  ownerName: string | null;
  establishmentName: string | null;
  paddockName: string | null;
  categoryName: string | null;
  breed: string | null;
  sex: string | null;
  birthDate: string | null;
  eventDate: string | null;
};

// Matches the headers of the source excel verbatim so the admin usually
// only has to confirm the auto-detected mapping instead of setting all ~13
// columns by hand. Any header not in this list (or a future file with
// slightly different wording) falls back to "ignore" and stays editable in
// the mapper UI.
const HEADER_MEANING_BY_TEXT: Record<string, ImportColumnMeaning> = {
  "IDE (caravana electrónica)": "tag",
  "Chip secundario": "secondaryTag",
  Propietario: "owner",
  Estancia: "establishment",
  "Potrero actual": "paddock",
  Categoría: "category",
  Raza: "breed",
  Sexo: "sex",
  "Fecha nacimiento": "birthDate",
  "Fecha alta en sistema": "eventDate",
};

export function detectImportMapping(headers: string[]): ImportColumnMapping[] {
  return headers.map((header) => ({ header, meaning: HEADER_MEANING_BY_TEXT[header] ?? "ignore" }));
}

function columnIndexFor(headers: string[], mapping: ImportColumnMapping[], meaning: ImportColumnMeaning): number {
  const mapped = mapping.find((m) => m.meaning === meaning);
  if (!mapped) return -1;
  return headers.indexOf(mapped.header);
}

export function applyImportColumnMapping(
  headers: string[],
  rows: string[][],
  mapping: ImportColumnMapping[]
): MappedImportRow[] {
  const tagIndex = columnIndexFor(headers, mapping, "tag");
  const secondaryTagIndex = columnIndexFor(headers, mapping, "secondaryTag");
  const ownerIndex = columnIndexFor(headers, mapping, "owner");
  const establishmentIndex = columnIndexFor(headers, mapping, "establishment");
  const paddockIndex = columnIndexFor(headers, mapping, "paddock");
  const categoryIndex = columnIndexFor(headers, mapping, "category");
  const breedIndex = columnIndexFor(headers, mapping, "breed");
  const sexIndex = columnIndexFor(headers, mapping, "sex");
  const birthDateIndex = columnIndexFor(headers, mapping, "birthDate");
  const eventDateIndex = columnIndexFor(headers, mapping, "eventDate");

  return rows.map((row) => ({
    tag: tagIndex >= 0 ? (row[tagIndex] ?? "") : "",
    secondaryTag: secondaryTagIndex >= 0 ? (row[secondaryTagIndex] || null) : null,
    ownerName: ownerIndex >= 0 ? (row[ownerIndex] || null) : null,
    establishmentName: establishmentIndex >= 0 ? (row[establishmentIndex] || null) : null,
    paddockName: paddockIndex >= 0 ? (row[paddockIndex] || null) : null,
    categoryName: categoryIndex >= 0 ? (row[categoryIndex] || null) : null,
    breed: breedIndex >= 0 ? (row[breedIndex] || null) : null,
    sex: sexIndex >= 0 ? (row[sexIndex] || null) : null,
    birthDate: birthDateIndex >= 0 ? (row[birthDateIndex] || null) : null,
    eventDate: eventDateIndex >= 0 ? (row[eventDateIndex] || null) : null,
  }));
}
