export type ActivityType = 'transfer' | 'health'

export type ColumnMeaning = 'tag' | 'date' | 'category' | 'sex' | 'owner' | 'product' | 'ignore'

export type ColumnMapping = { header: string; meaning: ColumnMeaning }[]

export type RawExcelResult = { ok: true; headers: string[]; rows: string[][] } | { ok: false; error: string }

export type MappedRow = {
  tag: string
  category?: string
  sex?: string
  owner?: string
  date?: string
}

export type PreviewRow =
  | { tag: string; kind: 'existing'; animalId: string; eventDate: string }
  | {
      tag: string
      kind: 'new'
      categoryId: string | null
      ownerId: string | null
      sex: 'M' | 'H' | null
      eventDate: string
    }
  | { tag: string; kind: 'error'; reason: string }
