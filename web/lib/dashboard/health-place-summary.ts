import type { HealthEventRow } from "@/lib/dal/health-event-access";

export function monthsAgoISODate(months: number, from: Date = new Date()): string {
  const date = new Date(from);
  date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 10);
}

export type HealthByPlaceRow = {
  establishmentName: string;
  paddockName: string | null;
  count: number;
  events: HealthEventRow[];
};

export function summarizeHealthByPlace(rows: HealthEventRow[]): HealthByPlaceRow[] {
  const groups = new Map<string, HealthByPlaceRow>();

  for (const row of rows) {
    const key = `${row.establishmentName} ${row.paddockName ?? ""}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.events.push(row);
    } else {
      groups.set(key, { establishmentName: row.establishmentName, paddockName: row.paddockName, count: 1, events: [row] });
    }
  }

  return Array.from(groups.values());
}
