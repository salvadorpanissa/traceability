"use client";

import { useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import type { LivestockByCategoryRow } from "@/lib/dashboard/livestock-summary";
import { useLocale } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

// Validated categorical palette (dataviz skill reference palette) — order is
// the CVD-safety mechanism, so slots are assigned by index, never re-sorted.
const COLORS_LIGHT = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
];
const COLORS_DARK = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767",
];

type Segment = {
  label: string;
  value: number;
  color: string;
  percent: number;
  startAngle: number;
  endAngle: number;
};

function buildSegments(
  rows: { categoryName: string | null; count: number }[],
  colors: string[],
  noCategoryLabel: string
): Segment[] {
  const total = rows.reduce((s, r) => s + r.count, 0);
  if (total === 0) return [];

  let cumulative = 0;
  return rows.map((row, i) => {
    const startAngle = (cumulative / total) * 360;
    cumulative += row.count;
    const endAngle = (cumulative / total) * 360;
    return {
      label: row.categoryName ?? noCategoryLabel,
      value: row.count,
      color: colors[i % colors.length],
      percent: (row.count / total) * 100,
      startAngle,
      endAngle,
    };
  });
}

function formatPercent(percent: number): string {
  return `${percent.toFixed(2).replace(".", ",")}%`;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

const SIZE = 160;
const STROKE_WIDTH = 26;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CENTER = SIZE / 2;

export function StockByCategoryChart({
  rows,
}: {
  rows: LivestockByCategoryRow[];
}) {
  const { t } = useLocale();
  const { resolvedTheme } = useTheme();
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const isDarkMode = isClient && resolvedTheme === "dark";
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const segments = buildSegments(
    rows.filter((r) => r.count > 0),
    isDarkMode ? COLORS_DARK : COLORS_LIGHT,
    t("livestock.noCategory")
  );
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const active = activeIndex !== null ? (segments[activeIndex] ?? null) : null;

  if (segments.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("dashboard.stockByCategoryEmpty")}</p>;
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative">
        <svg width={SIZE} height={SIZE} aria-hidden="true">
          {segments.length === 1 ? (
            <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke={segments[0].color} strokeWidth={STROKE_WIDTH} />
          ) : (
            segments.map((seg, i) => {
              const isDimmed = activeIndex !== null && activeIndex !== i;
              return (
                <path
                  key={seg.label}
                  d={describeArc(CENTER, CENTER, RADIUS, seg.startAngle, seg.endAngle)}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={STROKE_WIDTH}
                  strokeOpacity={isDimmed ? 0.35 : 1}
                  className="cursor-pointer outline-none transition-opacity focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  tabIndex={0}
                  role="button"
                  aria-label={`${seg.label}: ${seg.value} (${formatPercent(seg.percent)})`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseLeave={() => setActiveIndex(null)}
                  onFocus={() => setActiveIndex(i)}
                  onBlur={() => setActiveIndex(null)}
                >
                  <title>{`${seg.label}: ${seg.value} (${formatPercent(seg.percent)})`}</title>
                </path>
              );
            })
          )}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <span className="text-xl font-bold tracking-tight tabular-nums">{active ? active.value : total}</span>
          <span className="line-clamp-2 text-[0.65rem] leading-tight text-muted-foreground">
            {active ? active.label : t("dashboard.stockByCategoryTotal")}
          </span>
          {active ? (
            <span className="text-[0.65rem] font-medium text-muted-foreground">{formatPercent(active.percent)}</span>
          ) : null}
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {segments.map((seg, i) => (
          <button
            key={seg.label}
            type="button"
            className={cn(
              "flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activeIndex === i ? "bg-muted" : "hover:bg-muted/60"
            )}
            onMouseEnter={() => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(null)}
            onFocus={() => setActiveIndex(i)}
            onBlur={() => setActiveIndex(null)}
          >
            <span className="inline-block size-3 shrink-0 rounded-sm" style={{ backgroundColor: seg.color }} />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{seg.label}</span>
            <span className="font-medium tabular-nums">{formatPercent(seg.percent)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
