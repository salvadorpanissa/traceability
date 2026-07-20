'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { LogoutButton } from '@/components/logout-button'
import type { Farm } from '@/lib/farms'
import type { UserProfile } from '@/lib/user'

export function AppShell({
  activeFarm,
  showFarmSwitcher,
  profile,
  children,
}: {
  activeFarm: Farm
  showFarmSwitcher: boolean
  profile: UserProfile
  children: React.ReactNode
}) {
  const router = useRouter()

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b p-4">
        <div>
          <p className="font-semibold">{activeFarm.name}</p>
          <p className="text-sm text-muted-foreground">
            {profile.name} · {profile.roleName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {showFarmSwitcher && (
            <Button variant="outline" onClick={() => router.push('/select-farm')}>
              Cambiar de campo
            </Button>
          )}
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  )
}
