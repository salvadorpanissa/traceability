import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { refreshDerivedState } from "../../../test/refresh-derived-state";
import {
  role,
  farm,
  userAccount,
  animal,
  animalTagHistory,
  category,
  batchOperation,
  event,
  eventTransfer,
  eventRecategorize,
  eventDeath,
} from "@/db/schema";
import type { MappedRow } from "@/lib/activities/column-mapping";

vi.mock("@/db", () => ({ db: testDb }));

const { resolveRecategorizeBatchRows } = await import("@/lib/activities/recategorize-resolution");

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

async function seedAnimalAtFarm(input: {
  farmId: string;
  adminId: string;
  tag: string;
  categoryId: string | null;
  sex?: "male" | "female" | null;
  birthDate?: string | null;
  dead?: boolean;
  noFarm?: boolean;
}) {
  const [createdAnimal] = await testDb
    .insert(animal)
    .values({ sex: input.sex ?? null, birthDate: input.birthDate ?? null })
    .returning();
  await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: input.tag });

  const [batch] = await testDb
    .insert(batchOperation)
    .values({ eventType: "transfer", farmId: input.farmId, animalCount: 1, createdBy: input.adminId })
    .returning();

  if (!input.noFarm) {
    const [transferEvent] = await testDb
      .insert(event)
      .values({
        eventType: "transfer",
        eventDate: "2026-01-01",
        animalId: createdAnimal.id,
        farmId: input.farmId,
        batchOperationId: batch.id,
        createdBy: input.adminId,
      })
      .returning();
    await testDb
      .insert(eventTransfer)
      .values({ eventId: transferEvent.id, originFarmId: input.farmId, destinationFarmId: input.farmId });
  }

  if (input.categoryId) {
    const [recatEvent] = await testDb
      .insert(event)
      .values({
        eventType: "recategorize",
        eventDate: "2026-01-01",
        animalId: createdAnimal.id,
        farmId: input.farmId,
        batchOperationId: batch.id,
        createdBy: input.adminId,
      })
      .returning();
    await testDb
      .insert(eventRecategorize)
      .values({ eventId: recatEvent.id, oldCategoryId: input.categoryId, newCategoryId: input.categoryId });
  }

  if (input.dead) {
    const [deathEvent] = await testDb
      .insert(event)
      .values({
        eventType: "death",
        eventDate: "2026-02-01",
        animalId: createdAnimal.id,
        farmId: input.farmId,
        batchOperationId: batch.id,
        createdBy: input.adminId,
      })
      .returning();
    await testDb.insert(eventDeath).values({ eventId: deathEvent.id });
  }

  await refreshDerivedState();
  return createdAnimal;
}

function row(overrides: Partial<MappedRow> = {}): MappedRow {
  return { tag: "AR1", date: null, category: null, sex: null, ownerName: null, notes: null, ...overrides };
}

describe("resolveRecategorizeBatchRows", () => {
  it("resolves an alive animal with its current category, regardless of which farm it's on", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    await seedAnimalAtFarm({ farmId: seededFarm.id, adminId: admin.id, tag: "AR1", categoryId: novillo.id });

    const result = await resolveRecategorizeBatchRows([row({ tag: "AR1", date: "2026-03-01" })], null);

    expect(result).toEqual([
      {
        tag: "AR1",
        eventDate: "2026-03-01",
        notes: null,
        status: "existing",
        animalId: expect.any(String),
        currentFarmId: seededFarm.id,
        currentCategoryId: novillo.id,
        currentCategoryName: "Novillo",
        sex: null,
      },
    ]);
  });

  it("resolves animals from different farms in the same file, without any farm selection", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [otherFarm] = await testDb.insert(farm).values({ name: "Campo Sur" }).returning();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    await seedAnimalAtFarm({ farmId: seededFarm.id, adminId: admin.id, tag: "AR1", categoryId: novillo.id });
    await seedAnimalAtFarm({ farmId: otherFarm.id, adminId: admin.id, tag: "AR2", categoryId: novillo.id });

    const result = await resolveRecategorizeBatchRows(
      [row({ tag: "AR1", date: "2026-03-01" }), row({ tag: "AR2", date: "2026-03-01" })],
      null
    );

    expect(result.map((r) => (r as { currentFarmId: string }).currentFarmId).sort()).toEqual(
      [seededFarm.id, otherFarm.id].sort()
    );
  });

  it("falls back to the form event date when the row has none", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    await seedAnimalAtFarm({ farmId: seededFarm.id, adminId: admin.id, tag: "AR1", categoryId: novillo.id });

    const result = await resolveRecategorizeBatchRows([row({ tag: "AR1", date: null })], "2026-04-01");

    expect(result[0]).toMatchObject({ status: "existing", eventDate: "2026-04-01" });
  });

  it("errors when neither the row nor the form supplies a date", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    await seedAnimalAtFarm({ farmId: seededFarm.id, adminId: admin.id, tag: "AR1", categoryId: novillo.id });

    const result = await resolveRecategorizeBatchRows([row({ tag: "AR1", date: null })], null);

    expect(result).toEqual([{ tag: "AR1", eventDate: "", notes: null, status: "error", reason: "Falta la fecha" }]);
  });

  it("errors on a missing tag", async () => {
    const result = await resolveRecategorizeBatchRows([row({ tag: "", date: "2026-03-01" })], null);

    expect(result).toEqual([
      { tag: "", eventDate: "2026-03-01", notes: null, status: "error", reason: "Falta la caravana" },
    ]);
  });

  it("errors on a tag repeated in the file", async () => {
    const result = await resolveRecategorizeBatchRows(
      [row({ tag: "AR1", date: "2026-03-01" }), row({ tag: "AR1", date: "2026-03-01" })],
      null
    );

    expect(result.every((r) => r.status === "error" && r.reason === "Caravana duplicada en el archivo")).toBe(true);
  });

  it("errors when the tag was never registered", async () => {
    const result = await resolveRecategorizeBatchRows([row({ tag: "AR-NOPE", date: "2026-03-01" })], null);

    expect(result).toEqual([
      { tag: "AR-NOPE", eventDate: "2026-03-01", notes: null, status: "error", reason: "Caravana no encontrada" },
    ]);
  });

  it("errors when the animal is dead or sold", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    await seedAnimalAtFarm({
      farmId: seededFarm.id,
      adminId: admin.id,
      tag: "AR1",
      categoryId: novillo.id,
      dead: true,
    });

    const result = await resolveRecategorizeBatchRows([row({ tag: "AR1", date: "2026-03-01" })], null);

    expect(result[0]).toMatchObject({ status: "error", reason: "El animal está vendido o muerto" });
  });

  it("errors when the animal has no farm at all", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    await seedAnimalAtFarm({
      farmId: seededFarm.id,
      adminId: admin.id,
      tag: "AR1",
      categoryId: novillo.id,
      noFarm: true,
    });

    const result = await resolveRecategorizeBatchRows([row({ tag: "AR1", date: "2026-03-01" })], null);

    expect(result[0]).toMatchObject({ status: "error", reason: "El animal no tiene campo asignado" });
  });

  it("resolves the category from age when the animal has none, using a sex-scoped bracket", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    await testDb.insert(category).values({ name: "Ternero/a", minAgeMonths: 0 });
    const [male24] = await testDb
      .insert(category)
      .values({ name: "Novillo 2 a 3 años", sex: "male", minAgeMonths: 24 })
      .returning();
    await seedAnimalAtFarm({
      farmId: seededFarm.id,
      adminId: admin.id,
      tag: "AR1",
      categoryId: null,
      sex: "male",
      birthDate: "2023-01-01", // 38 months old as of 2026-03-01
    });

    const result = await resolveRecategorizeBatchRows([row({ tag: "AR1", date: "2026-03-01" })], null);

    expect(result[0]).toMatchObject({
      status: "age-resolved",
      resolvedCategoryId: male24.id,
      resolvedCategoryName: "Novillo 2 a 3 años",
    });
  });

  it("is age-unresolvable when the animal has no category and no birth date", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    await testDb.insert(category).values({ name: "Novillo", sex: "male", minAgeMonths: 24 });
    await seedAnimalAtFarm({
      farmId: seededFarm.id,
      adminId: admin.id,
      tag: "AR1",
      categoryId: null,
      sex: "male",
      birthDate: null,
    });

    const result = await resolveRecategorizeBatchRows([row({ tag: "AR1", date: "2026-03-01" })], null);

    expect(result[0]).toMatchObject({ status: "age-unresolvable" });
  });

  it("is age-unresolvable when the animal has no category and no sex", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    await testDb.insert(category).values({ name: "Novillo", sex: "male", minAgeMonths: 24 });
    await seedAnimalAtFarm({
      farmId: seededFarm.id,
      adminId: admin.id,
      tag: "AR1",
      categoryId: null,
      sex: null,
      birthDate: "2023-01-01",
    });

    const result = await resolveRecategorizeBatchRows([row({ tag: "AR1", date: "2026-03-01" })], null);

    expect(result[0]).toMatchObject({ status: "age-unresolvable" });
  });

  it("is age-unresolvable when the animal's age doesn't reach any configured bracket", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    await testDb.insert(category).values({ name: "Novillo +3", sex: "male", minAgeMonths: 36 });
    await seedAnimalAtFarm({
      farmId: seededFarm.id,
      adminId: admin.id,
      tag: "AR1",
      categoryId: null,
      sex: "male",
      birthDate: "2026-01-01", // 2 months old
    });

    const result = await resolveRecategorizeBatchRows([row({ tag: "AR1", date: "2026-03-01" })], null);

    expect(result[0]).toMatchObject({ status: "age-unresolvable" });
  });

  it("includes the animal's sex on an existing row", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [novillo] = await testDb.insert(category).values({ name: "Novillo" }).returning();
    await seedAnimalAtFarm({
      farmId: seededFarm.id,
      adminId: admin.id,
      tag: "AR1",
      categoryId: novillo.id,
      sex: "female",
    });

    const result = await resolveRecategorizeBatchRows([row({ tag: "AR1", date: "2026-03-01" })], null);

    expect(result[0]).toMatchObject({ status: "existing", sex: "female" });
  });

  it("includes the animal's sex on an age-unresolvable row", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    await testDb.insert(category).values({ name: "Novillo", sex: "male", minAgeMonths: 24 });
    await seedAnimalAtFarm({
      farmId: seededFarm.id,
      adminId: admin.id,
      tag: "AR1",
      categoryId: null,
      sex: "female",
      birthDate: null,
    });

    const result = await resolveRecategorizeBatchRows([row({ tag: "AR1", date: "2026-03-01" })], null);

    expect(result[0]).toMatchObject({ status: "age-unresolvable", sex: "female" });
  });
});
