import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { farm, owner } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { listDicoseRegistrations, createDicoseRegistration } = await import("@/lib/dal/dicose-registration");

beforeEach(async () => {
  await resetTestDb();
});

describe("dicose-registration", () => {
  it("creates a registration and returns it with owner/farm names resolved", async () => {
    const [createdOwner] = await testDb.insert(owner).values({ name: "AIP" }).returning();
    const [createdFarm] = await testDb.insert(farm).values({ name: "Campo San Antonio" }).returning();

    const created = await createDicoseRegistration({
      ownerId: createdOwner.id,
      farmId: createdFarm.id,
      dicoseCode: "151400442",
    });

    expect(created).toMatchObject({
      ownerId: createdOwner.id,
      ownerName: "AIP",
      farmId: createdFarm.id,
      farmName: "Campo San Antonio",
      dicoseCode: "151400442",
    });
  });

  it("lists every registration with owner/farm names resolved", async () => {
    const [ownerAip] = await testDb.insert(owner).values({ name: "AIP" }).returning();
    const [ownerSasg] = await testDb.insert(owner).values({ name: "SASG" }).returning();
    const [createdFarm] = await testDb.insert(farm).values({ name: "Campo San Antonio" }).returning();

    await createDicoseRegistration({ ownerId: ownerAip.id, farmId: createdFarm.id, dicoseCode: "151400442" });
    await createDicoseRegistration({ ownerId: ownerSasg.id, farmId: createdFarm.id, dicoseCode: "151422799" });

    const registrations = await listDicoseRegistrations();
    expect(registrations).toHaveLength(2);
    expect(registrations.map((r) => r.dicoseCode).sort()).toEqual(["151400442", "151422799"]);
  });
});
