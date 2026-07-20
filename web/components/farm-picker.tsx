import { selectFarm } from '@/app/select-farm/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Farm } from '@/lib/farms'

export function FarmPicker({ farms }: { farms: Farm[] }) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Elegí un campo</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {farms.map((farm) => (
          <form key={farm.id} action={selectFarm.bind(null, farm.id)}>
            <Button type="submit" variant="outline" className="w-full justify-start">
              {farm.name}
            </Button>
          </form>
        ))}
      </CardContent>
    </Card>
  )
}
