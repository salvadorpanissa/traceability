"use client";

import { Button } from "@/components/ui/button";

type Farm = { id: string; name: string };

export function FarmPicker({
  farms,
  onSelect,
}: {
  farms: Farm[];
  onSelect: (farmId: string) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-2">
      {farms.map((f) => (
        <form key={f.id} action={onSelect.bind(null, f.id)}>
          <Button type="submit" variant="outline" className="w-full">
            {f.name}
          </Button>
        </form>
      ))}
    </div>
  );
}
