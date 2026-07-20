import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParsedExcelRow, PreviewRow } from './types'

export async function resolveBatchRows(supabase: SupabaseClient, rows: ParsedExcelRow[]): Promise<PreviewRow[]> {
  const duplicateTags = new Set(
    Object.entries(
      rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.tag] = (acc[row.tag] ?? 0) + 1
        return acc
      }, {})
    )
      .filter(([, count]) => count > 1)
      .map(([tag]) => tag)
  )

  const tags = [...new Set(rows.map((row) => row.tag))]
  const { data: existingAnimals, error: animalsError } = await supabase
    .from('animal_current_state')
    .select('animal_id, current_tag, status')
    .in('current_tag', tags)
  if (animalsError) throw animalsError

  const categoryNames = [...new Set(rows.map((row) => row.category).filter((c): c is string => !!c))]
  const { data: categories, error: categoriesError } = await supabase
    .from('category')
    .select('id, name')
    .in('name', categoryNames)
  if (categoriesError) throw categoriesError

  const animalByTag = new Map(existingAnimals?.map((a) => [a.current_tag, a]) ?? [])
  const categoryIdByName = new Map(categories?.map((c) => [c.name, c.id]) ?? [])

  return rows.map((row): PreviewRow => {
    if (duplicateTags.has(row.tag)) {
      return { tag: row.tag, kind: 'error', reason: 'Caravana duplicada en el Excel' }
    }

    const existing = animalByTag.get(row.tag)
    if (existing) {
      if (existing.status !== 'alive') {
        return { tag: row.tag, kind: 'error', reason: 'Animal vendido o muerto' }
      }
      return { tag: row.tag, kind: 'existing', animalId: existing.animal_id }
    }

    if (row.category) {
      const categoryId = categoryIdByName.get(row.category)
      if (!categoryId) {
        return { tag: row.tag, kind: 'error', reason: `Categoría "${row.category}" no existe` }
      }
      return { tag: row.tag, kind: 'new', categoryId }
    }

    return { tag: row.tag, kind: 'new', categoryId: null }
  })
}
