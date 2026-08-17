import * as React from "react";
import { InfoIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function Tip({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="tip"
      role="note"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground",
        className
      )}
      {...props}
    >
      <InfoIcon className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export { Tip };
