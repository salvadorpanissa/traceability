// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { animal, farm, reproductiveStatus } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { updateReproductiveStatus } = await import("@/lib/activities/reproductive-status-update");

beforeEach(async () => {
  await resetTestDb();
});

describe("updateReproductiveStatus", () => {
  it("overwrites an existing reproductive status with a new one", async () => {
    const [group] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [oldStatus] = await testDb.insert(reproductiveStatus).values({ farmId: group.id, name: "Preñada" }).returning();
    const [newStatus] = await testDb.insert(reproductiveStatus).values({ farmId: group.id, name: "Vacía" }).returning();
    const [createdAnimal] = await testDb.insert(animal).values({ reproductiveStatusId: oldStatus.id }).returning();

    await testDb.transaction(async (tx) => updateReproductiveStatus(tx, createdAnimal.id, newStatus.id));

    const [stored] = await testDb.select().from(animal).where(eq(animal.id, createdAnimal.id));
    expect(stored.reproductiveStatusId).toBe(newStatus.id);
  });

  it("does nothing when the incoming value is null (no data for this row)", async () => {
    const [group] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [status] = await testDb.insert(reproductiveStatus).values({ farmId: group.id, name: "Preñada" }).returning();
    const [createdAnimal] = await testDb.insert(animal).values({ reproductiveStatusId: status.id }).returning();

    await testDb.transaction(async (tx) => updateReproductiveStatus(tx, createdAnimal.id, null));

    const [stored] = await testDb.select().from(animal).where(eq(animal.id, createdAnimal.id));
    expect(stored.reproductiveStatusId).toBe(status.id);
  });
});
