// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { refreshDerivedState } from "../../../test/refresh-derived-state";
import {
  farm,
  role,
  establishment,
  userAccount,
  userFarm,
  animal,
  animalTagHistory,
  event,
  eventTransfer,
  batchOperation,
  reproductiveStatus,
} from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/lib/dal/session", () => ({
  requireSession: vi.fn(),
}));

const { requireSession } = await import("@/lib/dal/session");
const { updateAnimalAction } = await import("@/app/(protected)/animals/actions");

beforeEach(async () => {
  await resetTestDb();
});

async function seedFarmWithAnimal(tag: string) {
  const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
  const [seededFarmGroup] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
  const [seededFarm] = await testDb.insert(establishment).values({ farmId: seededFarmGroup.id, name: "Campo Norte" }).returning();
  const [admin] = await testDb
    .insert(userAccount)
    .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
    .returning();
  await testDb.insert(userFarm).values({ userId: admin.id, farmId: seededFarmGroup.id });
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

  vi.mocked(requireSession).mockResolvedValue({ user: { id: admin.id, role: "admin" } } as never);

  return { admin, seededFarm, seededFarmGroup, createdAnimal };
}

describe("updateAnimalAction", () => {
  it("accepts a reproductiveStatusId that belongs to the animal's own farm", async () => {
    const { seededFarmGroup, createdAnimal } = await seedFarmWithAnimal("AR000000000920");
    const [status] = await testDb.insert(reproductiveStatus).values({ farmId: seededFarmGroup.id, name: "Preñada" }).returning();

    const result = await updateAnimalAction({
      animalId: createdAnimal.id,
      sex: null,
      breed: null,
      birthDate: null,
      ownerId: null,
      secondaryTag: null,
      categoryId: null,
      reproductiveStatusId: status.id,
    });

    expect(result).toMatchObject({ ok: true, animal: { reproductiveStatusId: status.id } });
  });

  it("rejects a reproductiveStatusId that belongs to a different farm than the animal's establecimiento", async () => {
    const { createdAnimal } = await seedFarmWithAnimal("AR000000000921");
    const [otherFarmGroup] = await testDb.insert(farm).values({ name: "Cuatro Cerros" }).returning();
    const [otherFarmStatus] = await testDb.insert(reproductiveStatus).values({ farmId: otherFarmGroup.id, name: "Preñada" }).returning();

    const result = await updateAnimalAction({
      animalId: createdAnimal.id,
      sex: null,
      breed: null,
      birthDate: null,
      ownerId: null,
      secondaryTag: null,
      categoryId: null,
      reproductiveStatusId: otherFarmStatus.id,
    });

    expect(result).toEqual({ ok: false, error: "El estado reproductivo no pertenece al campo de este animal" });

    const [row] = await testDb.select().from(animal).where(eq(animal.id, createdAnimal.id));
    expect(row.reproductiveStatusId).toBeNull();
  });
});
