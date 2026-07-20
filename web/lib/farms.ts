import type { SupabaseClient } from '@supabase/supabase-js'

export type Farm = { id: string; name: string }

export async function getUserFarms(supabase: SupabaseClient): Promise<Farm[]> {
  const { data, error } = await supabase.from('farm').select('id, name').order('name')
  if (error) throw error
  return data ?? []
}
