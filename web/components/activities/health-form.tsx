'use client'

import { useState } from 'react'
import { validarLoteSanidad, confirmarLoteSanidad } from '@/app/(protected)/actividades/nueva/actions'
import { PreviewTable } from '@/components/activities/preview-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { PreviewRow } from '@/lib/activities/types'

type Product = { id: string; name: string; defaultDoseUnit: string | null; defaultWithdrawalDays: number | null }

export function HealthForm({ products }: { products: Product[] }) {
  const [file, setFile] = useState<File | null>(null)
  const [productId, setProductId] = useState('')
  const [dose, setDose] = useState('')
  const [doseUnit, setDoseUnit] = useState('')
  const [route, setRoute] = useState('')
  const [withdrawalDays, setWithdrawalDays] = useState('')
  const [rows, setRows] = useState<PreviewRow[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const hasErrors = rows?.some((r) => r.kind === 'error') ?? false
  const hasValidHealthParams =
    !!productId && Number(dose) > 0 && doseUnit.trim() !== '' && route.trim() !== ''

  const handleProductChange = (id: string) => {
    setProductId(id)
    const product = products.find((p) => p.id === id)
    if (product) {
      setDoseUnit(product.defaultDoseUnit ?? '')
      setWithdrawalDays(product.defaultWithdrawalDays?.toString() ?? '')
    }
  }

  const handleValidate = async () => {
    if (!file) return
    setMessage(null)
    const formData = new FormData()
    formData.set('excel', file)
    const result = await validarLoteSanidad(formData)
    if (!result.ok) {
      setMessage(result.error)
      setRows(null)
      return
    }
    setRows(result.rows)
  }

  const handleConfirm = async () => {
    if (!rows) return
    const result = await confirmarLoteSanidad({
      rows,
      productId,
      dose: Number(dose),
      doseUnit,
      route,
      withdrawalDays: withdrawalDays ? Number(withdrawalDays) : null,
    })
    setMessage(result.ok ? 'Lote confirmado.' : result.error)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="excel">Archivo Excel</Label>
        <Input id="excel" type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="product">Producto</Label>
        <select
          id="product"
          value={productId}
          onChange={(e) => handleProductChange(e.target.value)}
          className="border rounded-md h-9 px-2"
        >
          <option value="">Elegí un producto</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="dose">Dosis</Label>
        <Input id="dose" type="number" value={dose} onChange={(e) => setDose(e.target.value)} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="dose-unit">Unidad de dosis</Label>
        <Input id="dose-unit" value={doseUnit} onChange={(e) => setDoseUnit(e.target.value)} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="route">Vía de administración</Label>
        <Input id="route" value={route} onChange={(e) => setRoute(e.target.value)} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="withdrawal-days">Días de carencia</Label>
        <Input
          id="withdrawal-days"
          type="number"
          value={withdrawalDays}
          onChange={(e) => setWithdrawalDays(e.target.value)}
        />
      </div>

      <Button type="button" onClick={handleValidate} disabled={!file || !productId}>
        Validar
      </Button>

      {rows && <PreviewTable rows={rows} />}
      {message && <p className="text-sm">{message}</p>}

      <Button type="button" onClick={handleConfirm} disabled={!rows || hasErrors || !hasValidHealthParams}>
        Confirmar
      </Button>
    </div>
  )
}
