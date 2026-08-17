import type { ReactNode } from "react";

// Shared card shell for the two paddock/sanidad tag-mismatch warnings
// (health-form's "not in the chosen paddock" and "missing from the
// paddock" lists) — same layout, only the color and body differ.
export function PaddockTagListCard({
  colorClassName,
  children,
}: {
  colorClassName: string;
  children: ReactNode;
}) {
  return <div className={`rounded-lg border p-3 text-sm ${colorClassName}`}>{children}</div>;
}

export function PaddockTagListItems({ children }: { children: ReactNode }) {
  return <ul className="max-h-40 list-disc overflow-y-auto pl-5">{children}</ul>;
}
