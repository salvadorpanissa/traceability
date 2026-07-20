'use client'

import { Button } from '@/components/ui/button'

export default function Error({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
      <p className="text-sm text-muted-foreground">
        Algo salió mal. Intentá de nuevo en unos minutos.
      </p>
      <Button onClick={() => reset()}>Reintentar</Button>
    </div>
  )
}
