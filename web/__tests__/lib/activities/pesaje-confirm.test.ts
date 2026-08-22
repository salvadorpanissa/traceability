// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { refreshDerivedState } from "../../../test/refresh-derived-state";
import { farm, role, establishment, userAccount, animal, event, eventTransfer, eventPesaje, batchOperation } from "@/db/schema";
import type { PesajeResolvedRow } from "@/lib/activities/pesaje-resolution";

vi.mock("@/db", () => ({ db: testDb }));

const { confirmPesajeBatch } = await import("@/lib/activities/pesaje");

beforeEach(async () => {
  await resetTestDb();
});

async function seedFarmAndAdmin() {
  const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
  const [seededFarmGroup] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
  const [seededFarm] = await testDb.insert(establishment).values({ farmId: seededFarmGroup.id, name: "Campo Norte" }).returning();
  const [admin] = await testDb
    .insert(userAccount)
    .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
    .returning();
  return { admin, seededFarm, seededFarmGroup };
}

async function seedAnimalAtFarm(establishmentId: string, createdBy: string): Promise<string> {
  const [createdAnimal] = await testDb.insert(animal).values({}).returning();
  const [batch] = await testDb
    .insert(batchOperation)
    .values({ eventType: "transfer", establishmentId, animalCount: 1, createdBy })
    .returning();
  const [transferEvent] = await testDb
    .insert(event)
    .values({ eventType: "transfer", eventDate: "2026-01-01", animalId: createdAnimal.id, establishmentId, batchOperationId: batch.id, createdBy })
    .returning();
  await testDb
    .insert(eventTransfer)
    .values({ eventId: transferEvent.id, originEstablishmentId: establishmentId, destinationEstablishmentId: establishmentId });
  return createdAnimal.id;
}

function existingRow(overrides: Partial<Extract<PesajeResolvedRow, { status: "existing" }>>): PesajeResolvedRow {
  return {
    tag: "AR1",
    eventDate: "2026-03-01",
    notes: null,
    status: "existing",
    animalId: "placeholder",
    currentEstablishmentId: "placeholder",
    weightKg: "420",
    ...overrides,
  };
}

describe("confirmPesajeBatch", () => {
  it("writes an individual weight as-is, unestimated", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const animalId = await seedAnimalAtFarm(seededFarm.id, admin.id);
    await refreshDerivedState();

    await confirmPesajeBatch({
      userId: admin.id,
      role: "admin",
      operatingFarmId: seededFarmGroup.id,
      rows: [existingRow({ animalId, currentEstablishmentId: seededFarm.id, weightKg: "417.3" })],
    });

    const events = (await testDb.select().from(event).where(eq(event.animalId, animalId))).filter(
      (e) => e.eventType === "pesaje",
    );
    expect(events).toHaveLength(1);
    const [pesaje] = await testDb.select().from(eventPesaje).where(eq(eventPesaje.eventId, events[0].id));
    expect(pesaje.weightKg).toBe("417.3");
    expect(pesaje.estimated).toBe(false);
  });

  it("splits a truckload total evenly across the batch and marks it estimated", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const animalA = await seedAnimalAtFarm(seededFarm.id, admin.id);
    const animalB = await seedAnimalAtFarm(seededFarm.id, admin.id);
    await refreshDerivedState();

    await confirmPesajeBatch({
      userId: admin.id,
      role: "admin",
      operatingFarmId: seededFarmGroup.id,
      rows: [
        existingRow({ animalId: animalA, currentEstablishmentId: seededFarm.id, tag: "AR1", weightKg: null }),
        existingRow({ animalId: animalB, currentEstablishmentId: seededFarm.id, tag: "AR2", weightKg: null }),
      ],
      totalWeightKg: "900",
    });

    for (const animalId of [animalA, animalB]) {
      const events = (await testDb.select().from(event).where(eq(event.animalId, animalId))).filter(
        (e) => e.eventType === "pesaje",
      );
      expect(events).toHaveLength(1);
      const [pesaje] = await testDb.select().from(eventPesaje).where(eq(eventPesaje.eventId, events[0].id));
      expect(pesaje.weightKg).toBe("450.0");
      expect(pesaje.estimated).toBe(true);
    }
  });

  it("rejects the whole batch if any row is an error", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const animalId = await seedAnimalAtFarm(seededFarm.id, admin.id);
    await refreshDerivedState();

    await expect(
      confirmPesajeBatch({
        userId: admin.id,
        role: "admin",
        operatingFarmId: seededFarmGroup.id,
        rows: [
          existingRow({ animalId, currentEstablishmentId: seededFarm.id }),
          { tag: "AR2", eventDate: "2026-03-01", notes: null, status: "error", reason: "Caravana no encontrada" },
        ],
      }),
    ).rejects.toThrow("El lote tiene filas con error; no se puede confirmar");
  });

  it("rejects an individual-mode row missing a weight when no truckload total is given", async () => {
    const { admin, seededFarm, seededFarmGroup } = await seedFarmAndAdmin();
    const animalId = await seedAnimalAtFarm(seededFarm.id, admin.id);
    await refreshDerivedState();

    await expect(
      confirmPesajeBatch({
        userId: admin.id,
        role: "admin",
        operatingFarmId: seededFarmGroup.id,
        rows: [existingRow({ animalId, currentEstablishmentId: seededFarm.id, weightKg: null })],
      }),
    ).rejects.toThrow("Falta el peso de uno o más animales");
  });

  it("rejects a row whose animal is on a different farm group than operatingFarmId", async () => {
    const { admin, seededFarm } = await seedFarmAndAdmin();
    const [otherFarmGroup] = await testDb.insert(farm).values({ name: "Campo Ajeno" }).returning();
    const animalId = await seedAnimalAtFarm(seededFarm.id, admin.id);
    await refreshDerivedState();

    await expect(
      confirmPesajeBatch({
        userId: admin.id,
        role: "admin",
        operatingFarmId: otherFarmGroup.id,
        rows: [existingRow({ animalId, currentEstablishmentId: seededFarm.id })],
      }),
    ).rejects.toThrow("El lote cambió desde que se generó la vista previa; volvé a subir el archivo.");
  });
});
