"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n/context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Syringe } from "lucide-react";
import type { HealthBatchRow } from "@/lib/dashboard/health-batch-summary";
import { voidHealthBatchAction } from "@/app/(protected)/activities/health/actions";

export function RecentHealthEvents({
  batches,
}: {
  batches: HealthBatchRow[];
}) {
  const { t } = useLocale();
  const MAX_ITEMS = 5;
  const [visibleBatches, setVisibleBatches] = useState(batches);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  async function handleVoid(batchId: string) {
    if (!window.confirm(t("dashboard.recentHealthVoidConfirm"))) return;
    setErrorId(null);
    setVoidingId(batchId);
    try {
      await voidHealthBatchAction(batchId);
      setVisibleBatches((prev) => prev.filter((b) => b.batchId !== batchId));
    } catch {
      setErrorId(batchId);
    } finally {
      setVoidingId(null);
    }
  }

  if (visibleBatches.length === 0) {
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
      {visibleBatches.slice(0, MAX_ITEMS).map((batch, index) => (
        <Card key={batch.batchId + String(index)} size="sm">
          <CardContent>
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="font-medium text-sm">{batch.productName}</p>
                <p className="text-xs text-muted-foreground">
                  {batch.establishmentName}
                  {batch.paddockName ? ` • ${batch.paddockName}` : ""}
                  {" • "}
                  {batch.animalCount} {t("dashboard.recentHealthHead")}
                </p>
                {errorId === batch.batchId ? (
                  <p className="text-xs text-red-600">{t("dashboard.recentHealthVoidError")}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-muted-foreground">{batch.eventDate}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={voidingId === batch.batchId}
                  onClick={() => handleVoid(batch.batchId)}
                >
                  {t("dashboard.recentHealthVoid")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
