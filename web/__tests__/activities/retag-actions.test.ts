// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { refreshDerivedState } from "../../test/refresh-derived-state";
import { farm, role, establishment, userAccount, userFarm, animal, animalTagHistory, batchOperation, event, eventTransfer } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { lookupRetagCandidateAction, confirmRetagAction } = await import("../../app/(protected)/activities/retag/actions");
const { auth } = await import("@/auth");

beforeEach(async () => {
  await resetTestDb();
});

async function seedManagerSession() {
  const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
  const [seededFarmGroup] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
  const [seededFarm] = await testDb.insert(establishment).values({ farmId: seededFarmGroup.id, name: "Campo Norte" }).returning();
  const [manager] = await testDb
    .insert(userAccount)
    .values({ name: "Manager", email: "manager@example.com", passwordHash: "hashed", roleId: managerRole.id })
    .returning();
  await testDb.insert(userFarm).values({ userId: manager.id, farmId: seededFarmGroup.id });
  vi.mocked(auth).mockResolvedValue({ user: { id: manager.id, role: "manager" } } as never);
  return { manager, seededFarm };
}

async function seedAliveAnimal(tag: string, establishmentId: string, createdBy: string) {
  const [createdAnimal] = await testDb.insert(animal).values({}).returning();
  await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag });
  const [batch] = await testDb
    .insert(batchOperation)
    .values({ eventType: "transfer", establishmentId, animalCount: 1, createdBy })
    .returning();
  const [placementEvent] = await testDb
    .insert(event)
    .values({ eventType: "transfer", eventDate: "2026-01-01", animalId: createdAnimal.id, establishmentId, batchOperationId: batch.id, createdBy })
    .returning();
  await testDb.insert(eventTransfer).values({
    eventId: placementEvent.id,
    originEstablishmentId: establishmentId,
    destinationEstablishmentId: establishmentId,
    originPaddockId: null,
    destinationPaddockId: null,
  });
  await refreshDerivedState();
  return createdAnimal;
}

describe("lookupRetagCandidateAction", () => {
  it("returns the animal's current state for a known tag", async () => {
    const { manager, seededFarm } = await seedManagerSession();
    await seedAliveAnimal("AR000000002000", seededFarm.id, manager.id);

    const result = await lookupRetagCandidateAction("AR000000002000");
    expect(result?.status).toBe("alive");
    expect(result?.establishmentName).toBe("Campo Norte");
  });

  it("returns null for an unknown tag", async () => {
    await seedManagerSession();
    const result = await lookupRetagCandidateAction("AR000000009999");
    expect(result).toBeNull();
  });
});

describe("confirmRetagAction", () => {
  it("registers the retag and it is reflected in animal_current_state", async () => {
    const { manager, seededFarm } = await seedManagerSession();
    const createdAnimal = await seedAliveAnimal("AR000000002001", seededFarm.id, manager.id);

    await confirmRetagAction({ tag: "AR000000002001", newTag: "AR000000002099", eventDate: "2026-02-01" });

    const result = await testDb.execute<{ current_tag: string }>(sql`select current_tag from animal_current_state where animal_id = ${createdAnimal.id}`);
    expect(result.rows[0].current_tag).toBe("AR000000002099");
  });
});
