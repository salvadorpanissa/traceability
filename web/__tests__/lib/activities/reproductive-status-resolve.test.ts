import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { farm, reproductiveStatus } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { resolveReproductiveStatusNames } = await import("@/lib/activities/reproductive-status-resolve");

beforeEach(async () => {
  await resetTestDb();
});

describe("resolveReproductiveStatusNames", () => {
  it("reuses an existing status matched case-insensitively", async () => {
    const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [status] = await testDb.insert(reproductiveStatus).values({ farmId: seededFarm.id, name: "Preñada" }).returning();

    const result = await resolveReproductiveStatusNames(seededFarm.id, { "1": "preñada" });

    expect(result).toEqual({ "1": status.id });
  });

  it("creates a new status when no existing one matches", async () => {
    const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();

    const result = await resolveReproductiveStatusNames(seededFarm.id, { "2": "Vacía" });

    const [created] = await testDb.select().from(reproductiveStatus).where(eq(reproductiveStatus.farmId, seededFarm.id));
    expect(created.name).toBe("Vacía");
    expect(result).toEqual({ "2": created.id });
  });

  it("maps a blank name to an empty string, meaning sin dato, without creating anything", async () => {
    const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();

    const result = await resolveReproductiveStatusNames(seededFarm.id, { "3": "" });

    const rows = await testDb.select().from(reproductiveStatus).where(eq(reproductiveStatus.farmId, seededFarm.id));
    expect(rows).toHaveLength(0);
    expect(result).toEqual({ "3": "" });
  });
});
