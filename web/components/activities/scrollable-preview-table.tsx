import type { ReactNode } from "react";

// Consistent scroll container for every activity's preview table (sanidad,
// traslado, recategorización, venta) — one place to keep the height cap and
// border styling in sync across all of them.
export function ScrollablePreviewTable({ children }: { children: ReactNode }) {
  return <div className="max-h-96 overflow-y-auto rounded-lg border border-border">{children}</div>;
}
