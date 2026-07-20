'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TransferForm } from '@/components/activities/transfer-form'
import { HealthForm } from '@/components/activities/health-form'
import { Label } from '@/components/ui/label'
import type { Farm } from '@/lib/farms'

type Product = { id: string; name: string; defaultDoseUnit: string | null; defaultWithdrawalDays: number | null }

export default function NuevaActividadPage() {
  const [activityType, setActivityType] = useState<'transfer' | 'health'>('transfer')
  const [farms, setFarms] = useState<Farm[]>([])
  const [paddocksByFarm, setPaddocksByFarm] = useState<Record<string, Farm[]>>({})
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('farm')
      .select('id, name')
      .order('name')
      .then(async ({ data: farmRows }) => {
        setFarms(farmRows ?? [])
        const byFarm: Record<string, Farm[]> = {}
        for (const farm of farmRows ?? []) {
          const { data: paddockRows } = await supabase.from('paddock').select('id, name').eq('farm_id', farm.id)
          byFarm[farm.id] = paddockRows ?? []
        }
        setPaddocksByFarm(byFarm)
      })
    supabase
      .from('product')
      .select('id, name, default_dose_unit, default_withdrawal_days')
      .order('name')
      .then(({ data }) => {
        setProducts(
          (data ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            defaultDoseUnit: p.default_dose_unit,
            defaultWithdrawalDays: p.default_withdrawal_days,
          }))
        )
      })
  }, [])

  return (
    <div>
      {/*
        Deliberately not "Nueva actividad" — the preview table below labels
        newly-created animals "Nueva", and Playwright's getByText does
        substring matching, so a heading containing that word collides with
        the table cell in strict mode (same class of issue Task 3 hit on the
        transfer-only page's original heading).
      */}
      <h1 className="text-2xl font-semibold mb-4">Registrar actividad</h1>

      <div className="grid gap-2 mb-4">
        <Label htmlFor="activity-type">Tipo de actividad</Label>
        <select
          id="activity-type"
          value={activityType === 'transfer' ? 'Traslado' : 'Sanidad'}
          onChange={(e) => setActivityType(e.target.value === 'Traslado' ? 'transfer' : 'health')}
          className="border rounded-md h-9 px-2"
        >
          <option value="Traslado">Traslado</option>
          <option value="Sanidad">Sanidad</option>
        </select>
      </div>

      {activityType === 'transfer' ? (
        <TransferForm farms={farms} paddocksByFarm={paddocksByFarm} />
      ) : (
        <HealthForm products={products} />
      )}
    </div>
  )
}
