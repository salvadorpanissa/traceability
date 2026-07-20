import type { ActivityType, ColumnMapping, ColumnMeaning, MappedRow } from './types'

export function computeHeaderSignature(headers: string[]): string {
  return JSON.stringify(headers.map((h) => h.trim()))
}

export function validateColumnMapping(mapping: ColumnMapping, activityType: ActivityType): string | null {
  const meanings = mapping.map((m) => m.meaning)

  if (meanings.filter((m) => m === 'tag').length !== 1) {
    return 'Tenés que asignar exactamente una columna como "Caravana".'
  }
  if (meanings.filter((m) => m === 'date').length > 1) {
    return 'Solo podés asignar una columna como "Fecha".'
  }
  if (meanings.filter((m) => m === 'category').length > 1) {
    return 'Solo podés asignar una columna como "Categoría".'
  }
  if (meanings.filter((m) => m === 'sex').length > 1) {
    return 'Solo podés asignar una columna como "Sexo".'
  }
  if (meanings.filter((m) => m === 'owner').length > 1) {
    return 'Solo podés asignar una columna como "Propietario".'
  }
  if (activityType === 'transfer' && meanings.some((m) => m === 'product')) {
    return 'La columna "Producto" solo se puede usar en sanidad.'
  }

  return null
}

function columnIndexesByMeaning(mapping: ColumnMapping, meaning: ColumnMeaning): number[] {
  return mapping.reduce<number[]>((indexes, entry, i) => {
    if (entry.meaning === meaning) indexes.push(i)
    return indexes
  }, [])
}

function normalizeSex(raw: string): 'M' | 'H' | undefined {
  const value = raw.trim().toUpperCase()
  if (value === 'M' || value === 'MACHO') return 'M'
  if (value === 'H' || value === 'HEMBRA') return 'H'
  return undefined
}

function normalizeDate(raw: string): string | undefined {
  if (!raw.trim()) return undefined
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return undefined
  return parsed.toISOString().slice(0, 10)
}

export function applyColumnMapping(headers: string[], rows: string[][], mapping: ColumnMapping): MappedRow[] {
  const tagIndex = columnIndexesByMeaning(mapping, 'tag')[0]
  const dateIndex = columnIndexesByMeaning(mapping, 'date')[0]
  const categoryIndex = columnIndexesByMeaning(mapping, 'category')[0]
  const sexIndex = columnIndexesByMeaning(mapping, 'sex')[0]
  const ownerIndex = columnIndexesByMeaning(mapping, 'owner')[0]

  return rows
    .map((row): MappedRow | null => {
      const tag = row[tagIndex]?.trim() ?? ''
      if (!tag) return null

      return {
        tag,
        category: categoryIndex !== undefined ? row[categoryIndex]?.trim() || undefined : undefined,
        sex: sexIndex !== undefined ? normalizeSex(row[sexIndex] ?? '') : undefined,
        owner: ownerIndex !== undefined ? row[ownerIndex]?.trim() || undefined : undefined,
        date: dateIndex !== undefined ? normalizeDate(row[dateIndex] ?? '') : undefined,
      }
    })
    .filter((row): row is MappedRow => row !== null)
}

export function extractProductSuggestions(headers: string[], rows: string[][], mapping: ColumnMapping): string[] {
  const productIndexes = columnIndexesByMeaning(mapping, 'product')
  const suggestions: string[] = []
  for (const index of productIndexes) {
    const firstValue = rows.map((row) => row[index]?.trim()).find((value) => !!value)
    if (firstValue) suggestions.push(firstValue)
  }
  return suggestions
}
