import type { ReactNode } from "react";

// Consistent scroll container for every activity's preview table (sanidad,
// traslado, recategorización, venta) — one place to keep the height cap and
// border styling in sync across all of them. Also covers the shorter,
// unbordered scroll box used for inline warning tables (e.g. sale-form's
// withdrawal-period list) that already sit inside their own bordered card.
export function ScrollablePreviewTable({
  children,
  maxHeight = "max-h-96",
  bordered = true,
}: {
  children: ReactNode;
  maxHeight?: string;
  bordered?: boolean;
}) {
  const classes = [maxHeight, "overflow-y-auto", bordered && "rounded-lg border border-border"].filter(Boolean).join(" ");
  return <div className={classes}>{children}</div>;
}
