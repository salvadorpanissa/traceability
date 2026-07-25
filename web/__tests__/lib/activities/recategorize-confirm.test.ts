import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { role, farm, userAccount, category, animal, event, eventRecategorize, batchOperation } from "@/db/schema";
import type { RecategorizeResolvedRow } from "@/lib/activities/recategorize-resolution";

vi.mock("@/db", () => ({ db: testDb }));

const { confirmRecategorizeBatch } = await import("@/lib/activities/recategorize");

beforeEach(async () => {
  await resetTestDb();
});

async function seedFarmAndAdmin() {
  const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
  const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
  const [admin] = await testDb
    .insert(userAccount)
    .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
    .returning();
  return { admin, seededFarm };
}

// event.animalId is a NOT NULL foreign key to animal.id — every test row
// needs a real animal row behind it, not just a random UUID.
async function seedBareAnimal(): Promise<string> {
  const [created] = await testDb.insert(animal).values({}).returning();
  return created.id;
}

function existingRow(overrides: Partial<Extract<RecategorizeResolvedRow, { status: "existing" }>>): RecategorizeResolvedRow {
  return {
    tag: "AR1",
    eventDate: "2026-03-01",
    notes: null,
    status: "existing",
    animalId: "placeholder",
    currentCategoryId: "placeholder",
    currentCategoryName: "Novillo",
    ...overrides,
  } as RecategorizeResolvedRow;
}

describe("confirmRecategorizeBatch", () => {
  it("creates a manual recategorize event for an animal whose category changes", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    const [novilloPlus3] = await testDb.insert(category).values({ name: "Novillo +3 años" }).returning();
    const animalId = await seedBareAnimal();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      operatingFarmId: seededFarm.id,
      targetCategoryId: novilloPlus3.id,
      rows: [existingRow({ animalId, currentCategoryId: novillo.id })],
    });

    const events = await testDb.select().from(event).where(eq(event.animalId, animalId));
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("recategorize");

    const [recat] = await testDb.select().from(eventRecategorize).where(eq(eventRecategorize.eventId, events[0].id));
    expect(recat.oldCategoryId).toBe(novillo.id);
    expect(recat.newCategoryId).toBe(novilloPlus3.id);
    expect(recat.source).toBe("manual");

    const [batch] = await testDb.select().from(batchOperation);
    expect(batch.eventType).toBe("recategorize");
    expect(batch.animalCount).toBe(1);
  });

  it("skips an animal whose category already equals the target, without creating an event", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    const [other] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    const unchangedAnimalId = await seedBareAnimal();
    const changingAnimalId = await seedBareAnimal();

    await confirmRecategorizeBatch({
      userId: admin.id,
      role: "admin",
      operatingFarmId: seededFarm.id,
      targetCategoryId: novillo.id,
      rows: [
        existingRow({ animalId: unchangedAnimalId, currentCategoryId: novillo.id, tag: "AR1" }),
        existingRow({ animalId: changingAnimalId, currentCategoryId: other.id, tag: "AR2" }),
      ],
    });

    const unchangedEvents = await testDb.select().from(event).where(eq(event.animalId, unchangedAnimalId));
    expect(unchangedEvents).toHaveLength(0);
    const changingEvents = await testDb.select().from(event).where(eq(event.animalId, changingAnimalId));
    expect(changingEvents).toHaveLength(1);

    const [batch] = await testDb.select().from(batchOperation);
    expect(batch.animalCount).toBe(1);
  });

  it("rejects when every row is a no-op", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    const animalId = await seedBareAnimal();

    await expect(
      confirmRecategorizeBatch({
        userId: admin.id,
        role: "admin",
        operatingFarmId: seededFarm.id,
        targetCategoryId: novillo.id,
        rows: [existingRow({ animalId, currentCategoryId: novillo.id })],
      })
    ).rejects.toThrow("Ningún animal cambia de categoría; no se puede confirmar");

    const batches = await testDb.select().from(batchOperation);
    expect(batches).toHaveLength(0);
  });

  it("rejects the whole batch if any row is an error", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    const [otherCategory] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    const animalId = await seedBareAnimal();

    await expect(
      confirmRecategorizeBatch({
        userId: admin.id,
        role: "admin",
        operatingFarmId: seededFarm.id,
        targetCategoryId: novillo.id,
        rows: [
          existingRow({ animalId, currentCategoryId: otherCategory.id }),
          { tag: "AR2", eventDate: "2026-03-01", notes: null, status: "error", reason: "Caravana no encontrada" },
        ],
      })
    ).rejects.toThrow("El lote tiene filas con error; no se puede confirmar");

    const batches = await testDb.select().from(batchOperation);
    expect(batches).toHaveLength(0);
  });
});
