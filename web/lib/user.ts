import type { SupabaseClient } from '@supabase/supabase-js'

export type UserProfile = { name: string; roleName: 'manager' | 'admin' }

export async function getCurrentUserProfile(supabase: SupabaseClient, userId: string): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('user_account')
    .select('name, role:role(name)')
    .eq('id', userId)
    .single()

  if (error) throw error

  return { name: data.name, roleName: (data.role as unknown as { name: 'manager' | 'admin' }).name }
}
