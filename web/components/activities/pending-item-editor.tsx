"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function PendingItemEditor({
  title,
  buttonLabel,
  defaultErrorMessage,
  pendingNames,
  onCreate,
  onResolved,
}: {
  title: string;
  buttonLabel: string;
  defaultErrorMessage: string;
  pendingNames: string[];
  onCreate: (name: string) => Promise<unknown>;
  onResolved: (name: string) => void;
}) {
  const [errorByName, setErrorByName] = useState<Record<string, string>>({});
  const [resolvedNames, setResolvedNames] = useState<string[]>([]);

  async function handleCreate(name: string) {
    setErrorByName((prev) => ({ ...prev, [name]: "" }));
    try {
      await onCreate(name);
      setResolvedNames((prev) => [...prev, name]);
      onResolved(name);
    } catch (error) {
      setErrorByName((prev) => ({
        ...prev,
        [name]: error instanceof Error ? error.message : defaultErrorMessage,
      }));
    }
  }

  const remaining = pendingNames.filter((name) => !resolvedNames.includes(name));
  if (remaining.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">{title}</p>
      {remaining.map((name) => (
        <div key={name} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
          <p className="text-sm text-muted-foreground">{name}</p>
          <Button type="button" size="sm" onClick={() => handleCreate(name)}>
            {buttonLabel}
          </Button>
          {errorByName[name] ? <p className="text-sm text-red-600">{errorByName[name]}</p> : null}
        </div>
      ))}
    </div>
  );
}
