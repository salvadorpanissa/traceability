import { createClient } from '@/lib/supabase/server'
import { getUserFarms, type Farm } from '@/lib/farms'
import { TransferForm } from '@/components/activities/transfer-form'

export default async function NuevaActividadPage() {
  const supabase = await createClient()
  const farms = await getUserFarms(supabase)

  const paddocksByFarm: Record<string, Farm[]> = {}
  for (const farm of farms) {
    const { data } = await supabase.from('paddock').select('id, name').eq('farm_id', farm.id)
    paddocksByFarm[farm.id] = data ?? []
  }

  return (
    <div>
      {/*
        Deliberately not "Nueva actividad: Traslado" — the preview table
        below labels newly-created animals "Nueva", and Playwright's
        getByText does substring matching, so a heading containing that
        word would collide with the table cell in strict mode.
      */}
      <h1 className="text-2xl font-semibold mb-4">Traslado de animales</h1>
      <TransferForm farms={farms} paddocksByFarm={paddocksByFarm} />
    </div>
  )
}
