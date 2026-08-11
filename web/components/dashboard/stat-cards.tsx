"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useLocale } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { TrendingUp, MapPin, Syringe } from "lucide-react";

type StatCard = {
  label: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  iconBg: string;
};

export function StatCards({
  totalLivestock,
  animalChange,
  activePaddocks,
  healthEventsLastMonths,
}: {
  totalLivestock: number;
  animalChange: number;
  activePaddocks: number;
  healthEventsLastMonths: number;
}) {
  const { t } = useLocale();

  const cards: StatCard[] = [
    {
      label: t("dashboard.statTotalLivestock"),
      value: totalLivestock.toLocaleString(),
      subtitle: animalChange !== 0 ? `${animalChange > 0 ? "+" : ""}${animalChange} ${t("dashboard.statThisMonth")}` : "—",
      icon: <TrendingUp className="size-5" />,
      iconBg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
    },
    {
      label: t("dashboard.statActivePaddocks"),
      value: String(activePaddocks),
      subtitle: t("dashboard.statActivePaddocksSub"),
      icon: <MapPin className="size-5" />,
      iconBg: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400",
    },
    {
      label: t("dashboard.statHealthLast3Months"),
      value: String(healthEventsLastMonths),
      subtitle: t("dashboard.statHealthThisMonthSub"),
      icon: <Syringe className="size-5" />,
      iconBg: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <Card key={card.label} size="sm">
          <CardContent className="flex items-start gap-3 pt-(--card-spacing)">
            <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", card.iconBg)}>
              {card.icon}
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="text-xs text-muted-foreground">{card.label}</span>
              <span className="text-2xl font-bold tracking-tight">{card.value}</span>
              <span className="text-xs text-muted-foreground">{card.subtitle}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
