'use client'

import { useEffect } from 'react'
import { selectFarm } from '@/app/select-farm/actions'

export function AutoSelectFarm({ farmId }: { farmId: string }) {
  useEffect(() => {
    selectFarm(farmId)
  }, [farmId])

  return <p className="p-4 text-center text-sm text-muted-foreground">Entrando a tu campo...</p>
}
