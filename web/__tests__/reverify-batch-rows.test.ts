import { describe, test, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { reverifyBatchRows } from '@/lib/activities/reverify-batch-rows'
import type { PreviewRow } from '@/lib/activities/types'

type QueryResult = { data: unknown[] | null; error: unknown }

function buildSupabaseMock(opts: { animalCurrentState?: QueryResult; tagLookup?: QueryResult }) {
  const animalCurrentStateResult: QueryResult = opts.animalCurrentState ?? { data: [], error: null }
  const tagLookupResult: QueryResult = opts.tagLookup ?? { data: [], error: null }

  const from = vi.fn((table: string) => {
    if (table !== 'animal_current_state') throw new Error(`Unexpected table: ${table}`)
    return {
      select: vi.fn((columns: string) => ({
        in: vi.fn(() => {
          if (columns.includes('status')) return Promise.resolve(animalCurrentStateResult)
          return Promise.resolve(tagLookupResult)
        }),
      })),
    }
  })

  return { from } as unknown as SupabaseClient
}

describe('reverifyBatchRows', () => {
  test('returns null when all existing rows are alive and no new tag collides', async () => {
    const rows: PreviewRow[] = [
      { tag: '100', kind: 'existing', animalId: 'animal-1' },
      { tag: '200', kind: 'new', categoryId: null },
    ]
    const supabase = buildSupabaseMock({
      animalCurrentState: { data: [{ animal_id: 'animal-1', status: 'alive' }], error: null },
      tagLookup: { data: [], error: null },
    })

    const result = await reverifyBatchRows(supabase, rows)

    expect(result).toBeNull()
  })

  test('returns an error when an existing row animal is not alive', async () => {
    const rows: PreviewRow[] = [{ tag: '100', kind: 'existing', animalId: 'animal-1' }]
    const supabase = buildSupabaseMock({
      animalCurrentState: { data: [{ animal_id: 'animal-1', status: 'sold' }], error: null },
    })

    const result = await reverifyBatchRows(supabase, rows)

    expect(result).toEqual('Alguna caravana del lote corresponde a un animal vendido o muerto. Volvé a validar el Excel.')
  })

  test('returns an error when there is a duplicate tag across the rows array', async () => {
    const rows: PreviewRow[] = [
      { tag: '100', kind: 'new', categoryId: null },
      { tag: '100', kind: 'new', categoryId: null },
    ]
    const supabase = buildSupabaseMock({})

    const result = await reverifyBatchRows(supabase, rows)

    expect(result).toEqual('El lote tiene caravanas duplicadas. Volvé a validar el Excel.')
  })

  test('returns an error when a new row tag already exists in animal_current_state', async () => {
    const rows: PreviewRow[] = [{ tag: '300', kind: 'new', categoryId: null }]
    const supabase = buildSupabaseMock({
      tagLookup: { data: [{ current_tag: '300' }], error: null },
    })

    const result = await reverifyBatchRows(supabase, rows)

    expect(result).toEqual('Alguna caravana marcada como nueva ya existe en el sistema. Volvé a validar el Excel.')
  })

  test('returns an error when an existing row animal id can no longer be found', async () => {
    const rows: PreviewRow[] = [{ tag: '100', kind: 'existing', animalId: 'animal-1' }]
    const supabase = buildSupabaseMock({
      animalCurrentState: { data: [], error: null },
    })

    const result = await reverifyBatchRows(supabase, rows)

    expect(result).toEqual('Alguna caravana del lote ya no está disponible. Volvé a validar el Excel.')
  })

  test('returns a generic error when the status query fails', async () => {
    const rows: PreviewRow[] = [{ tag: '100', kind: 'existing', animalId: 'animal-1' }]
    const supabase = buildSupabaseMock({
      animalCurrentState: { data: null, error: new Error('boom') },
    })

    const result = await reverifyBatchRows(supabase, rows)

    expect(result).toEqual('No pudimos verificar el lote. Intentá de nuevo en unos minutos.')
  })
})
