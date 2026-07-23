import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { refreshDerivedState } from "../../../test/refresh-derived-state";
import {
  role,
  farm,
  userAccount,
  animal,
  animalTagHistory,
  batchOperation,
  event,
  eventTransfer,
  eventSale,
  category,
  owner,
  dicoseRegistration,
  ownTag,
} from "@/db/schema";
import type { MappedRow } from "@/lib/activities/column-mapping";

vi.mock("@/db", () => ({ db: testDb }));

const { resolveBatchRows } = await import("@/lib/activities/batch-resolution");

beforeEach(async () => {
  await resetTestDb();
});

async function seedFarmUserRole(farmName = "Campo Norte") {
  const [existingRole] = await testDb.select().from(role).where(eq(role.name, "admin"));
  const adminRole = existingRole ?? (await testDb.insert(role).values({ name: "admin" }).returning())[0];
  const [seededFarm] = await testDb.insert(farm).values({ name: farmName }).returning();
  const [user] = await testDb
    .insert(userAccount)
    .values({ name: "Admin", email: `admin-${farmName}@example.com`, passwordHash: "hashed", roleId: adminRole.id })
    .returning();
  return { seededFarm, user };
}

async function seedExistingAnimal(tag: string, opts: { sold?: boolean } = {}) {
  const { seededFarm, user } = await seedFarmUserRole();
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
    await testDb.insert(eventSale).values({ eventId: saleEvent.id });
  }

  await refreshDerivedState();
  return { seededFarm, user, createdAnimal };
}

async function seedOwnTag(tag: string, farmId: string, ownerName: string) {
  const [ownerRow] = await testDb.insert(owner).values({ name: ownerName }).returning();
  const [registration] = await testDb
    .insert(dicoseRegistration)
    .values({ ownerId: ownerRow.id, farmId, dicoseCode: "999999999" })
    .returning();
  await testDb.insert(ownTag).values({ tag, dicoseRegistrationId: registration.id });
  return ownerRow;
}

describe("resolveBatchRows", () => {
  it("resolves an existing, alive animal with its current location", async () => {
    const { seededFarm, createdAnimal } = await seedExistingAnimal("AR000000000001");
    const rows: MappedRow[] = [
      { tag: "AR000000000001", date: null, category: null, sex: null, ownerName: null, notes: null },
    ];

    const [resolved] = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);

    expect(resolved).toMatchObject({
      status: "existing",
      tag: "AR000000000001",
      animalId: createdAnimal.id,
      currentFarmId: seededFarm.id,
      eventDate: "2026-02-01",
    });
  });

  it("errors a sold or dead animal", async () => {
    const { seededFarm } = await seedExistingAnimal("AR000000000002", { sold: true });
    const rows: MappedRow[] = [
      { tag: "AR000000000002", date: null, category: null, sex: null, ownerName: null, notes: null },
    ];

    const [resolved] = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);
    expect(resolved.status).toBe("error");
  });

  it("resolves a registered tag at its own farm with a matching category", async () => {
    const { seededFarm, user } = await seedFarmUserRole();
    await seedOwnTag("AR000000000003", seededFarm.id, "AIP");
    const [createdCategory] = await testDb.insert(category).values({ name: "Vaca" }).returning();
    const rows: MappedRow[] = [
      { tag: "AR000000000003", date: null, category: "Vaca", sex: null, ownerName: null, notes: null },
    ];

    const [resolved] = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);
    expect(resolved).toMatchObject({ status: "new", tag: "AR000000000003", categoryId: createdCategory.id });
  });

  it("errors an unregistered tag with an unrecognized category before checking ownership", async () => {
    const { seededFarm } = await seedFarmUserRole();
    const rows: MappedRow[] = [
      { tag: "AR000000000004", date: null, category: "NoExiste", sex: null, ownerName: null, notes: null },
    ];
    const [resolved] = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);
    expect(resolved.status).toBe("error");
  });

  it("errors both rows of a duplicated tag within the same file", async () => {
    const { seededFarm } = await seedFarmUserRole();
    const rows: MappedRow[] = [
      { tag: "AR000000000005", date: null, category: null, sex: null, ownerName: null, notes: null },
      { tag: "AR000000000005", date: null, category: null, sex: null, ownerName: null, notes: null },
    ];
    const resolved = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);
    expect(resolved[0].status).toBe("error");
    expect(resolved[1].status).toBe("error");
  });

  it("errors an empty tag", async () => {
    const { seededFarm } = await seedFarmUserRole();
    const rows: MappedRow[] = [{ tag: "", date: null, category: null, sex: null, ownerName: null, notes: null }];
    const [resolved] = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);
    expect(resolved.status).toBe("error");
  });

  it("uses the row's own date over the form date when present and valid", async () => {
    const { seededFarm } = await seedFarmUserRole();
    const rows: MappedRow[] = [
      { tag: "AR000000000006", date: "2026-03-10", category: null, sex: null, ownerName: null, notes: null },
    ];
    const [resolved] = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);
    expect(resolved.eventDate).toBe("2026-03-10");
  });

  it("normalizes a day/month/year slash date from Excel into ISO form", async () => {
    const { seededFarm } = await seedFarmUserRole();
    const rows: MappedRow[] = [
      { tag: "AR000000000041", date: "8/7/2026", category: null, sex: null, ownerName: null, notes: null },
    ];
    const [resolved] = await resolveBatchRows(rows, null, seededFarm.id);
    expect(resolved).toMatchObject({ status: "foreign", eventDate: "2026-07-08" });
  });

  it("normalizes a zero-padded slash date with dashes too", async () => {
    const { seededFarm } = await seedFarmUserRole();
    const rows: MappedRow[] = [
      { tag: "AR000000000042", date: "08-07-2026", category: null, sex: null, ownerName: null, notes: null },
    ];
    const [resolved] = await resolveBatchRows(rows, null, seededFarm.id);
    expect(resolved).toMatchObject({ status: "foreign", eventDate: "2026-07-08" });
  });

  it("falls back to the form date when the row date is unparseable", async () => {
    const { seededFarm } = await seedFarmUserRole();
    const rows: MappedRow[] = [
      { tag: "AR000000000043", date: "not a date", category: null, sex: null, ownerName: null, notes: null },
    ];
    const [resolved] = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);
    expect(resolved).toMatchObject({ status: "foreign", eventDate: "2026-02-01" });
  });

  it("normalizes a recognized sex value for a registered tag", async () => {
    const { seededFarm, user } = await seedFarmUserRole();
    await seedOwnTag("AR000000000030", seededFarm.id, "AIP");
    const rows: MappedRow[] = [
      { tag: "AR000000000030", date: null, category: null, sex: "MACHO", ownerName: null, notes: null },
    ];
    const [resolved] = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);
    expect(resolved).toMatchObject({ status: "new", sex: "male" });
  });

  it("leaves sex null for an unrecognized value, without erroring the row", async () => {
    const { seededFarm, user } = await seedFarmUserRole();
    await seedOwnTag("AR000000000031", seededFarm.id, "AIP");
    const rows: MappedRow[] = [
      { tag: "AR000000000031", date: null, category: null, sex: "???", ownerName: null, notes: null },
    ];
    const [resolved] = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);
    expect(resolved).toMatchObject({ status: "new", sex: null });
  });

  it("infers the owner from the tag's DICOSE registration, ignoring the Excel owner column", async () => {
    const { seededFarm, user } = await seedFarmUserRole();
    const registeredOwner = await seedOwnTag("AR000000000032", seededFarm.id, "AIP");
    const rows: MappedRow[] = [
      { tag: "AR000000000032", date: null, category: null, sex: null, ownerName: "Gómez", notes: null },
    ];
    const [resolved] = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);
    expect(resolved).toMatchObject({ status: "new", ownerId: registeredOwner.id, pendingOwnerName: null });
  });

  it("ignores the owner column for an existing animal's row", async () => {
    const { seededFarm } = await seedExistingAnimal("AR000000000034");
    const rows: MappedRow[] = [
      { tag: "AR000000000034", date: null, category: null, sex: "M", ownerName: "Gómez", notes: null },
    ];
    const [resolved] = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);
    expect(resolved.status).toBe("existing");
    expect(resolved).not.toHaveProperty("ownerId");
    expect(resolved).not.toHaveProperty("pendingOwnerName");
  });

  it("uses the row's own date when there is no fallback", async () => {
    const { seededFarm, user } = await seedFarmUserRole();
    await seedOwnTag("AR000000000035", seededFarm.id, "AIP");
    const rows: MappedRow[] = [
      { tag: "AR000000000035", date: "2026-03-10", category: null, sex: null, ownerName: null, notes: null },
    ];
    const [resolved] = await resolveBatchRows(rows, null, seededFarm.id);
    expect(resolved).toMatchObject({ status: "new", eventDate: "2026-03-10" });
  });

  it("errors a row with no date and no fallback provided", async () => {
    const { seededFarm } = await seedFarmUserRole();
    const rows: MappedRow[] = [
      { tag: "AR000000000036", date: null, category: null, sex: null, ownerName: null, notes: null },
    ];
    const [resolved] = await resolveBatchRows(rows, null, seededFarm.id);
    expect(resolved).toMatchObject({ status: "error", reason: "Falta la fecha" });
  });

  it("carries the row's notes through for a registered tag", async () => {
    const { seededFarm, user } = await seedFarmUserRole();
    await seedOwnTag("AR000000000037", seededFarm.id, "AIP");
    const rows: MappedRow[] = [
      { tag: "AR000000000037", date: null, category: null, sex: null, ownerName: null, notes: "Cojera leve" },
    ];
    const [resolved] = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);
    expect(resolved).toMatchObject({ status: "new", notes: "Cojera leve" });
  });

  it("carries the row's notes through for an existing animal", async () => {
    const { seededFarm } = await seedExistingAnimal("AR000000000038");
    const rows: MappedRow[] = [
      { tag: "AR000000000038", date: null, category: null, sex: null, ownerName: null, notes: "Revisar próxima vez" },
    ];
    const [resolved] = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);
    expect(resolved).toMatchObject({ status: "existing", notes: "Revisar próxima vez" });
  });

  it("marks an unregistered tag as foreign, carrying the Excel owner column as a fallback pending name", async () => {
    const { seededFarm } = await seedFarmUserRole();
    const rows: MappedRow[] = [
      { tag: "AR000000000040", date: null, category: null, sex: null, ownerName: "Gómez", notes: null },
    ];
    const [resolved] = await resolveBatchRows(rows, "2026-02-01", seededFarm.id);
    expect(resolved).toMatchObject({
      status: "foreign",
      forced: false,
      ownerId: null,
      pendingOwnerName: "Gómez",
    });
  });

  it("marks a tag registered at a different farm as wrong_farm, with the owner inferred from its DICOSE", async () => {
    const { seededFarm: homeFarm, user } = await seedFarmUserRole("Campo San Antonio");
    const { seededFarm: otherFarm } = await seedFarmUserRole("Cuatro Cerros");
    const registeredOwner = await seedOwnTag("AR000000000041", homeFarm.id, "AIP");
    const rows: MappedRow[] = [
      { tag: "AR000000000041", date: null, category: null, sex: null, ownerName: null, notes: null },
    ];

    const [resolved] = await resolveBatchRows(rows, "2026-02-01", otherFarm.id);

    expect(resolved).toMatchObject({
      status: "wrong_farm",
      ownerId: registeredOwner.id,
      registeredFarmId: homeFarm.id,
      registeredFarmName: "Campo San Antonio",
    });
  });
});
