"use client";

import { useLocale } from "@/lib/i18n/context";
import { Card, CardContent } from "@/components/ui/card";
import { Syringe } from "lucide-react";
import type { HealthBatchRow } from "@/lib/dashboard/health-batch-summary";

export function RecentHealthEvents({
  batches,
}: {
  batches: HealthBatchRow[];
}) {
  const { t } = useLocale();
  const MAX_ITEMS = 5;

  if (batches.length === 0) {
    return (
      <Card size="sm">
        <CardContent className="flex items-center gap-3 pt-(--card-spacing)">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Syringe className="size-5" />
          </div>
          <p className="text-sm text-muted-foreground">{t("dashboard.recentHealthEmpty")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {batches.slice(0, MAX_ITEMS).map((batch, index) => (
        <Card key={batch.batchId + String(index)} size="sm">
          <CardContent className="pt-(--card-spacing)">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="font-medium text-sm">{batch.productName}</p>
                <p className="text-xs text-muted-foreground">
                  {batch.farmName}
                  {batch.paddockName ? ` • ${batch.paddockName}` : ""}
                  {" • "}
                  {batch.animalCount} {t("dashboard.recentHealthHead")}
                </p>
              </div>
              <span className="shrink-0 px-2 text-muted-foreground">{batch.eventDate}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
