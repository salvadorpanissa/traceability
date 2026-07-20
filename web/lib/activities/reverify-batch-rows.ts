import type { SupabaseClient } from '@supabase/supabase-js'
import type { PreviewRow } from './types'

export async function reverifyBatchRows(supabase: SupabaseClient, rows: PreviewRow[]): Promise<string | null> {
  const tags = rows.map((row) => row.tag)
  const hasDuplicateTags = new Set(tags).size !== tags.length
  if (hasDuplicateTags) {
    return 'El lote tiene caravanas duplicadas. Volvé a validar el Excel.'
  }

  const existingIds = rows.filter((row) => row.kind === 'existing').map((row) => row.animalId)
  if (existingIds.length > 0) {
    const { data, error } = await supabase
      .from('animal_current_state')
      .select('animal_id, status')
      .in('animal_id', existingIds)
    if (error) return 'No pudimos verificar el lote. Intentá de nuevo en unos minutos.'
    if ((data?.length ?? 0) !== existingIds.length) {
      return 'Alguna caravana del lote ya no está disponible. Volvé a validar el Excel.'
    }
    if (data?.some((animal) => animal.status !== 'alive')) {
      return 'Alguna caravana del lote corresponde a un animal vendido o muerto. Volvé a validar el Excel.'
    }
  }

  const newTags = rows.filter((row) => row.kind === 'new').map((row) => row.tag)
  if (newTags.length > 0) {
    const { data, error } = await supabase
      .from('animal_current_state')
      .select('current_tag')
      .in('current_tag', newTags)
    if (error) return 'No pudimos verificar el lote. Intentá de nuevo en unos minutos.'
    if ((data?.length ?? 0) > 0) {
      return 'Alguna caravana marcada como nueva ya existe en el sistema. Volvé a validar el Excel.'
    }
  }

  return null
}
