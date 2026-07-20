'use client'

import { useState } from 'react'
import { validarLoteTraslado, confirmarLoteTraslado } from '@/app/(protected)/actividades/nueva/actions'
import { PreviewTable } from '@/components/activities/preview-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Farm } from '@/lib/farms'
import type { PreviewRow } from '@/lib/activities/types'

export function TransferForm({ farms, paddocksByFarm }: { farms: Farm[]; paddocksByFarm: Record<string, Farm[]> }) {
  const [file, setFile] = useState<File | null>(null)
  const [destinationFarmId, setDestinationFarmId] = useState('')
  const [destinationPaddockId, setDestinationPaddockId] = useState<string | null>(null)
  const [rows, setRows] = useState<PreviewRow[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const hasErrors = rows?.some((r) => r.kind === 'error') ?? false
  const paddockOptions = destinationFarmId ? (paddocksByFarm[destinationFarmId] ?? []) : []

  const handleValidate = async () => {
    if (!file) return
    setMessage(null)
    const formData = new FormData()
    formData.set('excel', file)
    const result = await validarLoteTraslado(formData)
    if (!result.ok) {
      setMessage(result.error)
      setRows(null)
      return
    }
    setRows(result.rows)
  }

  const handleConfirm = async () => {
    if (!rows) return
    const result = await confirmarLoteTraslado({ rows, destinationFarmId, destinationPaddockId })
    setMessage(result.ok ? 'Lote confirmado.' : result.error)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="excel">Archivo Excel</Label>
        <Input
          id="excel"
          type="file"
          accept=".xlsx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="destination-farm">Campo destino</Label>
        <Select
          value={destinationFarmId}
          onValueChange={(value) => {
            setDestinationFarmId(value ?? '')
            setDestinationPaddockId(null)
          }}
        >
          <SelectTrigger id="destination-farm">
            <SelectValue placeholder="Elegí un campo" />
          </SelectTrigger>
          <SelectContent>
            {farms.map((farm) => (
              <SelectItem key={farm.id} value={farm.id}>
                {farm.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {paddockOptions.length > 0 && (
        <div className="grid gap-2">
          <Label htmlFor="destination-paddock">Potrero destino (opcional)</Label>
          <Select value={destinationPaddockId ?? ''} onValueChange={setDestinationPaddockId}>
            <SelectTrigger id="destination-paddock">
              <SelectValue placeholder="Sin potrero específico" />
            </SelectTrigger>
            <SelectContent>
              {paddockOptions.map((paddock) => (
                <SelectItem key={paddock.id} value={paddock.id}>
                  {paddock.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Button type="button" onClick={handleValidate} disabled={!file || !destinationFarmId}>
        Validar
      </Button>

      {rows && <PreviewTable rows={rows} />}
      {message && <p className="text-sm">{message}</p>}

      <Button type="button" onClick={handleConfirm} disabled={!rows || hasErrors}>
        Confirmar
      </Button>
    </div>
  )
}
