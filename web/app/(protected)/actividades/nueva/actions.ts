'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { parseTagExcel } from '@/lib/activities/parse-tag-excel'
import { resolveBatchRows } from '@/lib/activities/resolve-batch-rows'
import type { PreviewRow } from '@/lib/activities/types'

export async function validarLoteTraslado(
  formData: FormData
): Promise<{ ok: true; rows: PreviewRow[] } | { ok: false; error: string }> {
  const file = formData.get('excel') as File | null
  if (!file) return { ok: false, error: 'No se recibió ningún archivo.' }

  const parsed = await parseTagExcel(await file.arrayBuffer())
  if (!parsed.ok) return { ok: false, error: parsed.error }

  const supabase = await createClient()

  try {
    const rows = await resolveBatchRows(supabase, parsed.rows)
    return { ok: true, rows }
  } catch {
    return { ok: false, error: 'No pudimos validar el lote. Intentá de nuevo en unos minutos.' }
  }
}

export async function confirmarLoteTraslado(input: {
  rows: PreviewRow[]
  destinationFarmId: string
  destinationPaddockId: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const cookieStore = await cookies()
  const operatingFarmId = cookieStore.get('active_farm_id')?.value
  if (!operatingFarmId) return { ok: false, error: 'No se pudo determinar el campo activo.' }

  const existingAnimalIds = input.rows.filter((r) => r.kind === 'existing').map((r) => r.animalId)
  const newAnimals = input.rows
    .filter((r) => r.kind === 'new')
    .map((r) => ({ tag: r.tag, category_id: r.categoryId }))

  const { error } = await supabase.rpc('confirm_transfer_batch', {
    p_farm_id: operatingFarmId,
    p_destination_farm_id: input.destinationFarmId,
    p_destination_paddock_id: input.destinationPaddockId,
    p_event_date: new Date().toISOString().slice(0, 10),
    p_existing_animal_ids: existingAnimalIds,
    p_new_animals: newAnimals,
  })

  if (error) return { ok: false, error: 'No se pudo confirmar el lote. Intentá de nuevo en unos minutos.' }
  return { ok: true }
}

export async function validarLoteSanidad(
  formData: FormData
): Promise<{ ok: true; rows: PreviewRow[] } | { ok: false; error: string }> {
  const file = formData.get('excel') as File | null
  if (!file) return { ok: false, error: 'No se recibió ningún archivo.' }

  const parsed = await parseTagExcel(await file.arrayBuffer())
  if (!parsed.ok) return { ok: false, error: parsed.error }

  const supabase = await createClient()
  try {
    const rows = await resolveBatchRows(supabase, parsed.rows)
    return { ok: true, rows }
  } catch {
    return { ok: false, error: 'No pudimos validar el lote. Intentá de nuevo en unos minutos.' }
  }
}

export async function confirmarLoteSanidad(input: {
  rows: PreviewRow[]
  productId: string
  dose: number
  doseUnit: string
  route: string
  withdrawalDays: number | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const cookieStore = await cookies()
  const operatingFarmId = cookieStore.get('active_farm_id')?.value
  if (!operatingFarmId) return { ok: false, error: 'No se pudo determinar el campo activo.' }

  const existingAnimalIds = input.rows.filter((r) => r.kind === 'existing').map((r) => r.animalId)
  const newAnimals = input.rows
    .filter((r) => r.kind === 'new')
    .map((r) => ({ tag: r.tag, category_id: r.categoryId }))

  const { error } = await supabase.rpc('confirm_health_batch', {
    p_farm_id: operatingFarmId,
    p_product_id: input.productId,
    p_dose: input.dose,
    p_dose_unit: input.doseUnit,
    p_route: input.route,
    p_withdrawal_days: input.withdrawalDays,
    p_event_date: new Date().toISOString().slice(0, 10),
    p_existing_animal_ids: existingAnimalIds,
    p_new_animals: newAnimals,
  })

  if (error) return { ok: false, error: 'No se pudo confirmar el lote. Intentá de nuevo en unos minutos.' }
  return { ok: true }
}
