import type { PreviewRow } from '@/lib/activities/types'

export function PreviewTable({ rows }: { rows: PreviewRow[] }) {
  // Duplicate tags in the source Excel produce one PreviewRow per
  // occurrence (all flagged identically as an error by resolveBatchRows),
  // which would otherwise render two rows with the exact same tag and
  // reason text — a React duplicate-key warning and, in the UI, an
  // indistinguishable repeated line. Dedupe by tag for display; the raw
  // `rows` array (with every occurrence) is still what gates confirmation.
  const uniqueRows = [...new Map(rows.map((row) => [row.tag, row])).values()]

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left">
          <th>Caravana</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        {uniqueRows.map((row) => (
          <tr key={row.tag}>
            <td>{row.tag}</td>
            <td>
              {row.kind === 'existing' && 'Existente'}
              {row.kind === 'new' && 'Nueva'}
              {row.kind === 'error' && row.reason}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
