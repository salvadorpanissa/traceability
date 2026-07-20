import { createClient } from '@/lib/supabase/server'
import { getUserFarms } from '@/lib/farms'
import { FarmPicker } from '@/components/farm-picker'
import { AutoSelectFarm } from '@/components/auto-select-farm'

export default async function SelectFarmPage() {
  const supabase = await createClient()

  let farms: Awaited<ReturnType<typeof getUserFarms>>
  try {
    farms = await getUserFarms(supabase)
  } catch {
    return (
      <main className="flex min-h-screen items-center justify-center p-4 text-center">
        <p>No pudimos cargar tus campos. Intentá de nuevo en unos minutos.</p>
      </main>
    )
  }

  if (farms.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4 text-center">
        <p>No tenés campos asignados. Contactá al administrador.</p>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      {farms.length === 1 ? <AutoSelectFarm farmId={farms[0].id} /> : <FarmPicker farms={farms} />}
    </main>
  )
}
