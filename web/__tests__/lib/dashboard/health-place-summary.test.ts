import { describe, expect, it } from "vitest";
import { summarizeHealthByPlace, monthsAgoISODate } from "@/lib/dashboard/health-place-summary";
import type { HealthEventRow } from "@/lib/dal/health-event-access";

function healthEvent(overrides: Partial<HealthEventRow>): HealthEventRow {
  return {
    eventId: "e1",
    eventDate: "2026-06-01",
    animalTag: "AR1",
    farmId: "f1",
    farmName: "Campo Norte",
    paddockId: "p1",
    paddockName: "Potrero 1",
    productName: "Ivermectina 1%",
    ...overrides,
  };
}

describe("summarizeHealthByPlace", () => {
  it("groups events by farm and paddock, counting each group and listing its events", () => {
    const rows = [
      healthEvent({ eventId: "e1", farmName: "Campo Norte", paddockName: "Potrero 1" }),
      healthEvent({ eventId: "e2", farmName: "Campo Norte", paddockName: "Potrero 1" }),
      healthEvent({ eventId: "e3", farmName: "Campo Norte", paddockName: "Potrero 2" }),
      healthEvent({ eventId: "e4", farmName: "Campo Sur", paddockName: "Potrero 1" }),
    ];

    const summary = summarizeHealthByPlace(rows);

    expect(summary).toHaveLength(3);
    const norte1 = summary.find((g) => g.farmName === "Campo Norte" && g.paddockName === "Potrero 1")!;
    expect(norte1.count).toBe(2);
    expect(norte1.events.map((e) => e.eventId)).toEqual(["e1", "e2"]);
  });

  it("groups events with no paddock under a null bucket", () => {
    const rows = [healthEvent({ paddockId: null, paddockName: null })];
    const summary = summarizeHealthByPlace(rows);
    expect(summary).toEqual([
      { farmName: "Campo Norte", paddockName: null, count: 1, events: [rows[0]] },
    ]);
  });

  it("returns an empty array for no rows", () => {
    expect(summarizeHealthByPlace([])).toEqual([]);
  });
});

describe("monthsAgoISODate", () => {
  it("subtracts the given number of months from the reference date", () => {
    expect(monthsAgoISODate(3, new Date("2026-06-15T00:00:00Z"))).toBe("2026-03-15");
  });

  it("handles crossing a year boundary", () => {
    expect(monthsAgoISODate(6, new Date("2026-02-01T00:00:00Z"))).toBe("2025-08-01");
  });
});
