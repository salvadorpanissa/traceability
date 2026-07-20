'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function selectFarm(farmId: string) {
  const cookieStore = await cookies()
  cookieStore.set('active_farm_id', farmId, { httpOnly: true, sameSite: 'lax', path: '/' })
  redirect('/dashboard')
}
