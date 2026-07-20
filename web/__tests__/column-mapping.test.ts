import { describe, test, expect } from 'vitest'
import {
  applyColumnMapping,
  computeHeaderSignature,
  extractProductSuggestions,
  validateColumnMapping,
} from '@/lib/activities/column-mapping'
import type { ColumnMapping } from '@/lib/activities/types'

describe('computeHeaderSignature', () => {
  test('is identical for the same headers in the same order', () => {
    expect(computeHeaderSignature(['IDE', 'SEXO'])).toEqual(computeHeaderSignature(['IDE', 'SEXO']))
  })

  test('differs when the order changes', () => {
    expect(computeHeaderSignature(['IDE', 'SEXO'])).not.toEqual(computeHeaderSignature(['SEXO', 'IDE']))
  })

  test('differs when a header name changes', () => {
    expect(computeHeaderSignature(['IDE', 'SEXO'])).not.toEqual(computeHeaderSignature(['IDE', 'SEXO2']))
  })
})

describe('validateColumnMapping', () => {
  test('requires exactly one column mapped as tag', () => {
    const mapping: ColumnMapping = [{ header: 'IDE', meaning: 'ignore' }]
    expect(validateColumnMapping(mapping, 'transfer')).toEqual('Tenés que asignar exactamente una columna como "Caravana".')
  })

  test('accepts a mapping with exactly one tag column and nothing else mapped', () => {
    const mapping: ColumnMapping = [{ header: 'IDE', meaning: 'tag' }]
    expect(validateColumnMapping(mapping, 'transfer')).toBeNull()
  })

  test('rejects two columns mapped as category', () => {
    const mapping: ColumnMapping = [
      { header: 'IDE', meaning: 'tag' },
      { header: 'CAT1', meaning: 'category' },
      { header: 'CAT2', meaning: 'category' },
    ]
    expect(validateColumnMapping(mapping, 'transfer')).toEqual('Solo podés asignar una columna como "Categoría".')
  })

  test('rejects a product-mapped column for traslado', () => {
    const mapping: ColumnMapping = [
      { header: 'IDE', meaning: 'tag' },
      { header: 'SANIDAD', meaning: 'product' },
    ]
    expect(validateColumnMapping(mapping, 'transfer')).toEqual('La columna "Producto" solo se puede usar en sanidad.')
  })

  test('accepts multiple product-mapped columns for sanidad', () => {
    const mapping: ColumnMapping = [
      { header: 'IDE', meaning: 'tag' },
      { header: 'SANIDAD', meaning: 'product' },
      { header: 'SANIDAD 2', meaning: 'product' },
    ]
    expect(validateColumnMapping(mapping, 'health')).toBeNull()
  })
})

describe('applyColumnMapping', () => {
  const headers = ['IDE', 'Fecha', 'CATEGORIA', 'SEXO', 'PROPIETARIO']
  const mapping: ColumnMapping = [
    { header: 'IDE', meaning: 'tag' },
    { header: 'Fecha', meaning: 'date' },
    { header: 'CATEGORIA', meaning: 'category' },
    { header: 'SEXO', meaning: 'sex' },
    { header: 'PROPIETARIO', meaning: 'owner' },
  ]

  test('maps every meaning onto its row', () => {
    const rows = [['123', '2026-01-15', 'Ternero', 'M', 'Juan Perez']]
    const result = applyColumnMapping(headers, rows, mapping)
    expect(result).toEqual([
      { tag: '123', category: 'Ternero', sex: 'M', owner: 'Juan Perez', date: '2026-01-15' },
    ])
  })

  test('normalizes long-form sex values', () => {
    const rows = [['123', '', '', 'Hembra', '']]
    const result = applyColumnMapping(headers, rows, mapping)
    expect(result[0].sex).toEqual('H')
  })

  test('leaves sex undefined for an unrecognized value instead of blocking', () => {
    const rows = [['123', '', '', 'unknown', '']]
    const result = applyColumnMapping(headers, rows, mapping)
    expect(result[0].sex).toBeUndefined()
  })

  test('skips rows with no tag value', () => {
    const rows = [['', '', '', '', '']]
    const result = applyColumnMapping(headers, rows, mapping)
    expect(result).toEqual([])
  })

  test('leaves date undefined when the mapped cell is empty or unparseable', () => {
    const rows = [['123', 'not a date', '', '', '']]
    const result = applyColumnMapping(headers, rows, mapping)
    expect(result[0].date).toBeUndefined()
  })
})

describe('extractProductSuggestions', () => {
  test('takes the first non-empty value from each product-mapped column', () => {
    const headers = ['IDE', 'SANIDAD', 'SANIDAD 2']
    const rows = [
      ['123', 'ASPERSIN', 'AFTOSA'],
      ['456', 'ASPERSIN', 'AFTOSA'],
    ]
    const mapping: ColumnMapping = [
      { header: 'IDE', meaning: 'tag' },
      { header: 'SANIDAD', meaning: 'product' },
      { header: 'SANIDAD 2', meaning: 'product' },
    ]
    expect(extractProductSuggestions(headers, rows, mapping)).toEqual(['ASPERSIN', 'AFTOSA'])
  })

  test('returns an empty array when no column is mapped as product', () => {
    const headers = ['IDE']
    const rows = [['123']]
    const mapping: ColumnMapping = [{ header: 'IDE', meaning: 'tag' }]
    expect(extractProductSuggestions(headers, rows, mapping)).toEqual([])
  })
})
