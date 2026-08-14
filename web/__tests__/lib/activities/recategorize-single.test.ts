// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { refreshDerivedState } from "../../../test/refresh-derived-state";
import {
  farm,
  role,
  establishment,
  userAccount,
  animal,
  animalTagHistory,
  category,
  event,
  eventTransfer,
  eventRecategorize,
  batchOperation,
} from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { confirmSingleRecategorize } = await import("@/lib/activities/recategorize-single");

beforeEach(async () => {
  await resetTestDb();
});

async function seedFarmWithAnimal(tag: string) {
  const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
  const [seededFarmGroup] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
  const [seededFarm] = await testDb
    .insert(establishment)
    .values({ farmId: seededFarmGroup.id, name: "Campo Norte" })
    .returning();
  const [admin] = await testDb
    .insert(userAccount)
    .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
    .returning();
  const [createdAnimal] = await testDb.insert(animal).values({}).returning();
  await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag });
  const [batch] = await testDb
    .insert(batchOperation)
    .values({ eventType: "transfer", establishmentId: seededFarm.id, animalCount: 1, createdBy: admin.id })
    .returning();
  const [transferEvent] = await testDb
    .insert(event)
    .values({
      eventType: "transfer",
      eventDate: "2026-01-01",
      animalId: createdAnimal.id,
      establishmentId: seededFarm.id,
      batchOperationId: batch.id,
      createdBy: admin.id,
    })
    .returning();
  await testDb
    .insert(eventTransfer)
    .values({ eventId: transferEvent.id, originEstablishmentId: seededFarm.id, destinationEstablishmentId: seededFarm.id });
  await refreshDerivedState();
  return { admin, seededFarm, seededFarmGroup, createdAnimal };
}

async function currentCategoryFor(animalId: string): Promise<string | null> {
  const result = await testDb.execute<{ current_category_id: string | null }>(
    sql`select current_category_id from animal_current_state where animal_id = ${animalId}`
  );
  return result.rows[0]?.current_category_id ?? null;
}

describe("confirmSingleRecategorize", () => {
  it("writes a one-animal recategorize event and updates the derived category", async () => {
    const { admin, seededFarm, seededFarmGroup, createdAnimal } = await seedFarmWithAnimal("AR000000000910");
    const [oldCategory] = await testDb.insert(category).values({ farmId: seededFarmGroup.id, name: "Vaca de cría" }).returning();
    const [newCategory] = await testDb.insert(category).values({ farmId: seededFarmGroup.id, name: "Vaca de invernada" }).returning();

    await confirmSingleRecategorize({
      userId: admin.id,
      animalId: createdAnimal.id,
      establishmentId: seededFarm.id,
      oldCategoryId: oldCategory.id,
      newCategoryId: newCategory.id,
    });

    expect(await currentCategoryFor(createdAnimal.id)).toBe(newCategory.id);

    const [recategorizeEvent] = await testDb
      .select()
      .from(event)
      .where(sql`${event.animalId} = ${createdAnimal.id} and ${event.eventType} = 'recategorize'`);
    expect(recategorizeEvent).toBeDefined();
    const [batchRow] = await testDb.select().from(batchOperation).where(sql`${batchOperation.id} = ${recategorizeEvent.batchOperationId}`);
    expect(batchRow.animalCount).toBe(1);

    const [recatRow] = await testDb.select().from(eventRecategorize).where(sql`${eventRecategorize.eventId} = ${recategorizeEvent.id}`);
    expect(recatRow).toMatchObject({ oldCategoryId: oldCategory.id, newCategoryId: newCategory.id, source: "manual" });
  });

  it("records an initial-source, self-referential event when the animal had no category", async () => {
    const { admin, seededFarm, seededFarmGroup, createdAnimal } = await seedFarmWithAnimal("AR000000000911");
    const [newCategory] = await testDb.insert(category).values({ farmId: seededFarmGroup.id, name: "Ternero" }).returning();

    await confirmSingleRecategorize({
      userId: admin.id,
      animalId: createdAnimal.id,
      establishmentId: seededFarm.id,
      oldCategoryId: null,
      newCategoryId: newCategory.id,
    });

    const [recategorizeEvent] = await testDb
      .select()
      .from(event)
      .where(sql`${event.animalId} = ${createdAnimal.id} and ${event.eventType} = 'recategorize'`);
    const [recatRow] = await testDb.select().from(eventRecategorize).where(sql`${eventRecategorize.eventId} = ${recategorizeEvent.id}`);
    expect(recatRow).toMatchObject({ oldCategoryId: newCategory.id, newCategoryId: newCategory.id, source: "initial" });
  });

  it("rejects a category that belongs to a different farm than the animal's establecimiento", async () => {
    const { admin, seededFarm, createdAnimal } = await seedFarmWithAnimal("AR000000000912");
    const [otherFarmGroup] = await testDb.insert(farm).values({ name: "Cuatro Cerros" }).returning();
    const [otherFarmCategory] = await testDb.insert(category).values({ farmId: otherFarmGroup.id, name: "Vaca de cría" }).returning();

    await expect(
      confirmSingleRecategorize({
        userId: admin.id,
        animalId: createdAnimal.id,
        establishmentId: seededFarm.id,
        oldCategoryId: null,
        newCategoryId: otherFarmCategory.id,
      })
    ).rejects.toThrow("La categoría no pertenece al campo de este animal");
  });
});
