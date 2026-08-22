type WizardStep = { key: string; label: string };

function statusFor(index: number, currentIndex: number): "completed" | "current" | "upcoming" {
  if (index < currentIndex) return "completed";
  if (index === currentIndex) return "current";
  return "upcoming";
}

export function WizardProgress({ steps, currentIndex }: { steps: WizardStep[]; currentIndex: number }) {
  return (
    <ol className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 border-b border-border pb-3 text-xs">
      {steps.map((step, index) => {
        const status = statusFor(index, currentIndex);
        return (
          <li
            key={step.key}
            data-status={status}
            className="flex items-center gap-2"
          >
            <span
              className={
                status === "current"
                  ? "font-semibold text-foreground"
                  : status === "completed"
                    ? "text-muted-foreground"
                    : "text-muted-foreground/50"
              }
            >
              {index + 1}. {step.label}
            </span>
            {index < steps.length - 1 ? <span aria-hidden="true" className="text-muted-foreground/50">›</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
