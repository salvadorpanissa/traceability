import { describe, expect, it } from "vitest";
import { friendlyColumnLabel } from "@/lib/dal/reporting/column-labels";

describe("friendlyColumnLabel", () => {
  it("translates a known column to Spanish", () => {
    expect(friendlyColumnLabel("animal_tag", "es")).toBe("Caravana");
    expect(friendlyColumnLabel("farm_name", "es")).toBe("Campo");
    expect(friendlyColumnLabel("event_date", "es")).toBe("Fecha");
  });

  it("translates a known column to English", () => {
    expect(friendlyColumnLabel("animal_tag", "en")).toBe("Tag");
    expect(friendlyColumnLabel("farm_name", "en")).toBe("Farm");
  });

  it("distinguishes origin/destination variants", () => {
    expect(friendlyColumnLabel("origin_farm_name", "es")).toBe("Campo origen");
    expect(friendlyColumnLabel("destination_farm_name", "es")).toBe("Campo destino");
  });

  it("humanizes an unrecognized snake_case column instead of leaving it raw", () => {
    expect(friendlyColumnLabel("cantidad_total", "es")).toBe("Cantidad Total");
    expect(friendlyColumnLabel("promedio", "es")).toBe("Promedio");
  });
});
