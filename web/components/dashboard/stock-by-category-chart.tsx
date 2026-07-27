"use client";

import { useLocale } from "@/lib/i18n/context";
import type { LivestockByCategoryRow } from "@/lib/dashboard/livestock-summary";

const COLORS = [
  "#22c55e", // green-500
  "#3b82f6", // blue-500
  "#f59e0b", // amber-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#14b8a6", // teal-500
  "#f97316", // orange-500
  "#6366f1", // indigo-500
];

function sumPieSegments(
  rows: { categoryName: string | null; count: number }[]
): { label: string; value: number; color: string; percent: number }[] {
  const total = rows.reduce((s, r) => s + r.count, 0);
  if (total === 0) return [];

  return rows.map((row, i) => ({
    label: row.categoryName ?? "Sin categoría",
    value: row.count,
    color: COLORS[i % COLORS.length],
    percent: Math.round((row.count / total) * 100),
  }));
}

function DonutChart({
  segments,
  size = 140,
  strokeWidth = 24,
}: {
  segments: { value: number; color: string }[];
  size: number;
  strokeWidth: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const total = segments.reduce((s, sgm) => s + sgm.value, 0);

  if (total === 0) {
    return (
      <svg width={size} height={size} className="shrink-0">
        <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--color-muted)" strokeWidth={strokeWidth} />
      </svg>
    );
  }

  // Single segment = full circle (SVG arc 0→360 draws nothing since start=end).
  if (segments.length === 1) {
    return (
      <svg width={size} height={size} className="shrink-0">
        <circle cx={center} cy={center} r={radius} fill="none" stroke={segments[0].color} strokeWidth={strokeWidth} />
      </svg>
    );
  }

  const arcs = segments.map((seg) => {
    const cumulative = segments.slice(0, segments.indexOf(seg)).reduce((s, sg) => s + sg.value, 0);
    const startAngle = (cumulative / total) * 360;
    const endAngle = ((cumulative + seg.value) / total) * 360;
    return { ...seg, startAngle, endAngle };
  });

  function polarToCartesian(
    cx: number,
    cy: number,
    r: number,
    angleDeg: number
  ): { x: number; y: number } {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function describeArc(
    cx: number,
    cy: number,
    r: number,
    startAngle: number,
    endAngle: number
  ): string {
    const start = polarToCartesian(cx, cy, r, endAngle);
    const end = polarToCartesian(cx, cy, r, startAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
  }

  return (
    <svg width={size} height={size} className="shrink-0">
      {arcs.map((arc, i) => (
        <path
          key={i}
          d={describeArc(center, center, radius, arc.startAngle, arc.endAngle)}
          fill="none"
          stroke={arc.color}
          strokeWidth={strokeWidth}
        />
      ))}
    </svg>
  );
}

export function StockByCategoryChart({
  rows,
}: {
  rows: LivestockByCategoryRow[];
}) {
  const { t } = useLocale();
  const segments = sumPieSegments(rows.filter((r) => r.count > 0));
  const total = segments.reduce((s, sgm) => s + sgm.value, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-6">
        <DonutChart
          segments={segments}
          size={140}
          strokeWidth={24}
        />
        <div className="flex flex-col gap-2">
          {segments.map((seg) => (
            <div key={seg.label} className="flex items-center gap-2 text-sm">
              <span
                className="inline-block size-3 shrink-0 rounded-sm"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-muted-foreground">{seg.label}</span>
              <span className="font-medium">{seg.percent}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
