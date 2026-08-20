export function StepHeading({ label, position }: { label: string; position: number }) {
  return (
    <p className="border-t border-border pt-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      Paso {position} · {label}
    </p>
  );
}
