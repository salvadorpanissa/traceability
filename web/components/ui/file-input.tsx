"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import { FileUp, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// type="file" inputs are uncontrolled: the browser owns the displayed
// filename, so calling setFile(null) elsewhere (e.g. resetting the form when
// an establishment changes) leaves the native input still showing the old
// filename. Reset the DOM value whenever the `file` prop goes back to null,
// and always show an explicit status box so the state is never ambiguous.
export function FileInput({
  file,
  onChange,
  ...props
}: {
  file: File | null;
  onChange: (file: File | null) => void;
} & Omit<ComponentProps<"input">, "type" | "value" | "onChange">) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file && inputRef.current) inputRef.current.value = "";
  }, [file]);

  return (
    <div className="flex flex-col gap-2">
      <Input ref={inputRef} type="file" onChange={(e) => onChange(e.target.files?.[0] ?? null)} {...props} />
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
          file ? "border-border bg-muted text-foreground" : "border-dashed border-border text-muted-foreground"
        )}
      >
        {file ? <FileText className="size-4 shrink-0" /> : <FileUp className="size-4 shrink-0" />}
        <span className="truncate">{file ? file.name : "Ningún archivo seleccionado todavía"}</span>
      </div>
    </div>
  );
}
