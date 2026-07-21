import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import {
  role,
  farm,
  userAccount,
  animal,
  animalTagHistory,
  batchOperation,
  event,
  eventTransfer,
  category,
} from "@/db/schema";
import type { MappedRow } from "@/lib/activities/column-mapping";

vi.mock("@/db", () => ({ db: testDb }));

const { resolveBatchRows } = await import("@/lib/activities/batch-resolution");

beforeEach(async () => {
  await resetTestDb();
});

async function seedExistingAnimal(tag: string, opts: { sold?: boolean } = {}) {
  const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
  const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
  const [user] = await testDb
    .insert(userAccount)
    .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
    .returning();
  const [createdAnimal] = await testDb.insert(animal).values({}).returning();
  await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag });

  const [batch] = await testDb
    .insert(batchOperation)
    .values({ eventType: "transfer", farmId: seededFarm.id, animalCount: 1, createdBy: user.id })
    .returning();
  const [createdEvent] = await testDb
    .insert(event)
    .values({
      eventType: "transfer",
      eventDate: "2026-01-01",
      animalId: createdAnimal.id,
      farmId: seededFarm.id,
      batchOperationId: batch.id,
      createdBy: user.id,
    })
    .returning();
  await testDb
    .insert(eventTransfer)
    .values({ eventId: createdEvent.id, originFarmId: seededFarm.id, destinationFarmId: seededFarm.id });

  if (opts.sold) {
    const [saleBatch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "sale", farmId: seededFarm.id, animalCount: 1, createdBy: user.id })
      .returning();
    const [saleEvent] = await testDb
      .insert(event)
      .values({
        eventType: "sale",
        eventDate: "2026-01-02",
        animalId: createdAnimal.id,
        farmId: seededFarm.id,
        batchOperationId: saleBatch.id,
        createdBy: user.id,
      })
      .returning();
    const { eventSale } = await import("@/db/schema");
    await testDb.insert(eventSale).values({ eventId: saleEvent.id });
  }

  return { seededFarm, createdAnimal };
}

describe("resolveBatchRows", () => {
  it("resolves an existing, alive animal with its current location", async () => {
    const { seededFarm, createdAnimal } = await seedExistingAnimal("AR000000000001");
    const rows: MappedRow[] = [{ tag: "AR000000000001", date: null, category: null }];

    const [resolved] = await resolveBatchRows(rows, "2026-02-01");

    expect(resolved).toMatchObject({
      status: "existing",
      tag: "AR000000000001",
      animalId: createdAnimal.id,
      currentFarmId: seededFarm.id,
      eventDate: "2026-02-01",
    });
  });

  it("errors a sold or dead animal", async () => {
    await seedExistingAnimal("AR000000000002", { sold: true });
    const rows: MappedRow[] = [{ tag: "AR000000000002", date: null, category: null }];

    const [resolved] = await resolveBatchRows(rows, "2026-02-01");
    expect(resolved.status).toBe("error");
  });

  it("resolves a new tag with a matching category", async () => {
    const [createdCategory] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    const rows: MappedRow[] = [{ tag: "AR000000000003", date: null, category: "Vaca" }];

    const [resolved] = await resolveBatchRows(rows, "2026-02-01");
    expect(resolved).toMatchObject({ status: "new", tag: "AR000000000003", categoryId: createdCategory.id });
  });

  it("errors a new tag with an unrecognized category", async () => {
    const rows: MappedRow[] = [{ tag: "AR000000000004", date: null, category: "NoExiste" }];
    const [resolved] = await resolveBatchRows(rows, "2026-02-01");
    expect(resolved.status).toBe("error");
  });

  it("errors both rows of a duplicated tag within the same file", async () => {
    const rows: MappedRow[] = [
      { tag: "AR000000000005", date: null, category: null },
      { tag: "AR000000000005", date: null, category: null },
    ];
    const resolved = await resolveBatchRows(rows, "2026-02-01");
    expect(resolved[0].status).toBe("error");
    expect(resolved[1].status).toBe("error");
  });

  it("errors an empty tag", async () => {
    const rows: MappedRow[] = [{ tag: "", date: null, category: null }];
    const [resolved] = await resolveBatchRows(rows, "2026-02-01");
    expect(resolved.status).toBe("error");
  });

  it("uses the row's own date over the form date when present and valid", async () => {
    const rows: MappedRow[] = [{ tag: "AR000000000006", date: "2026-03-10", category: null }];
    const [resolved] = await resolveBatchRows(rows, "2026-02-01");
    expect(resolved.eventDate).toBe("2026-03-10");
  });
});
