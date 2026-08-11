"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n/context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Syringe } from "lucide-react";
import type { HealthBatchRow, HealthBatchDetail } from "@/lib/dashboard/health-batch-summary";
import { voidHealthBatchAction, getHealthBatchDetailAction } from "@/app/(protected)/activities/health/actions";
import { formatLongDate, formatShortDate } from "@/lib/utils";

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

  const [detailBatchId, setDetailBatchId] = useState<string | null>(null);
  const [detail, setDetail] = useState<HealthBatchDetail | null>(null);
  const [detailError, setDetailError] = useState(false);
  // Most batches share one event date across every animal (the header
  // already shows it) — only worth its own column when an import gave
  // individual rows their own dates.
  const animalDatesVaryFromHeader = detail ? detail.animals.some((a) => a.eventDate !== detail.eventDate) : false;

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

  async function openDetail(batchId: string) {
    setDetailBatchId(batchId);
    setDetail(null);
    setDetailError(false);
    try {
      const result = await getHealthBatchDetailAction(batchId);
      if (!result) {
        setDetailError(true);
        return;
      }
      setDetail(result);
    } catch {
      setDetailError(true);
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
        <Card
          key={batch.batchId + String(index)}
          size="sm"
          className="cursor-pointer"
          onClick={() => openDetail(batch.batchId)}
        >
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
                  variant="destructive"
                  size="sm"
                  disabled={voidingId === batch.batchId}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleVoid(batch.batchId);
                  }}
                >
                  {t("dashboard.recentHealthVoid")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={detailBatchId !== null} onOpenChange={(open) => !open && setDetailBatchId(null)}>
        <DialogContent className="flex max-h-[85vh] flex-col overflow-x-hidden overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("dashboard.recentHealthDetailTitle")}</DialogTitle>
          </DialogHeader>
          {detailError ? (
            <p className="text-sm text-destructive">{t("dashboard.recentHealthDetailError")}</p>
          ) : !detail ? (
            <p className="text-sm text-muted-foreground">{t("dashboard.recentHealthDetailLoading")}</p>
          ) : (
            <div className="flex flex-col gap-4 text-sm">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">{t("dashboard.recentHealthDetailEstablishment")}</dt>
                <dd>
                  {detail.establishmentName}
                  {detail.paddockName ? `, ${detail.paddockName}` : ""}
                </dd>
                <dt className="text-muted-foreground">{t("dashboard.recentHealthDetailDate")}</dt>
                <dd>{formatLongDate(detail.eventDate)}</dd>
              </dl>

              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {t("dashboard.recentHealthDetailProducts")}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-1 pr-2 font-medium">{t("dashboard.recentHealthDetailProductName")}</th>
                        <th className="py-1 pr-2 font-medium">{t("dashboard.recentHealthDetailDose")}</th>
                        <th className="py-1 pr-2 font-medium">{t("dashboard.recentHealthDetailRoute")}</th>
                        <th className="py-1 font-medium">{t("dashboard.recentHealthDetailWithdrawal")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.products.map((product, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-1 pr-2 whitespace-nowrap">{product.name}</td>
                          <td className="py-1 pr-2 whitespace-nowrap">
                            {product.dose} {product.doseUnit}
                          </td>
                          <td className="py-1 pr-2 whitespace-nowrap">{product.route}</td>
                          <td className="py-1 whitespace-nowrap">
                            {product.withdrawalDays !== null ? `${product.withdrawalDays} días` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {t("dashboard.recentHealthDetailAnimals")} ({detail.animals.length})
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-1 pr-2 font-medium">{t("dashboard.recentHealthDetailTag")}</th>
                        {animalDatesVaryFromHeader ? (
                          <th className="py-1 pr-2 font-medium">{t("dashboard.recentHealthDetailDate")}</th>
                        ) : null}
                        <th className="py-1 pr-2 font-medium">{t("dashboard.recentHealthDetailWithdrawalUntil")}</th>
                        <th className="py-1 font-medium">{t("dashboard.recentHealthDetailNotes")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.animals.map((a) => (
                        <tr key={a.tag} className="border-b last:border-0">
                          <td className="py-1 pr-2 whitespace-nowrap">{a.tag}</td>
                          {animalDatesVaryFromHeader ? (
                            <td className="py-1 pr-2 whitespace-nowrap">{formatShortDate(a.eventDate)}</td>
                          ) : null}
                          <td className="py-1 pr-2 whitespace-nowrap">
                            {a.withdrawalUntil ? formatShortDate(a.withdrawalUntil) : "—"}
                          </td>
                          <td className="py-1 text-muted-foreground">{a.notes ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
