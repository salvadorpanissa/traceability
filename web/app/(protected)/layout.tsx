import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserFarms } from '@/lib/farms'
import { getCurrentUserProfile } from '@/lib/user'
import { AppShell } from '@/components/app-shell'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  // proxy.ts already redirects unauthenticated requests to /login using a
  // fast local JWT-claims check. Re-verify here with a server-validated
  // getUser() call: a session can be revoked (e.g. sign-out) between the
  // middleware's check and this render, and getCurrentUserProfile below
  // requires a real user to be present.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const cookieStore = await cookies()
  const activeFarmId = cookieStore.get('active_farm_id')?.value

  const farms = await getUserFarms(supabase)
  const activeFarm = farms.find((f) => f.id === activeFarmId)

  if (!activeFarm) {
    redirect('/select-farm')
  }

  const profile = await getCurrentUserProfile(supabase)

  return (
    <AppShell activeFarm={activeFarm} showFarmSwitcher={farms.length > 1} profile={profile}>
      {children}
    </AppShell>
  )
}
