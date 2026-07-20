import type { SupabaseClient } from '@supabase/supabase-js'

export type UserProfile = { name: string; roleName: 'manager' | 'admin' }

export async function getCurrentUserProfile(supabase: SupabaseClient): Promise<UserProfile> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('getCurrentUserProfile called without an authenticated user')
  }

  const { data, error } = await supabase
    .from('user_account')
    .select('name, role:role(name)')
    .eq('id', user.id)
    .single()

  if (error) throw error

  return { name: data.name, roleName: (data.role as unknown as { name: 'manager' | 'admin' }).name }
}
