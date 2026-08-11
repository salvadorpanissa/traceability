// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import {
  farm,
  role,
  establishment,
  userAccount,
  userFarm,
  animal,
  animalTagHistory,
  batchOperation,
  event,
  eventSale,
  saleSettlement,
} from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/activities/cledinor-settlement-parsing", () => ({
  parseCledinorSettlement: vi.fn(),
}));

const { previewSaleSettlement, linkSaleSettlementAction } =
  await import("../../app/(protected)/activities/sale-settlement/actions");
const { auth } = await import("@/auth");
const { parseCledinorSettlement } =
  await import("@/lib/activities/cledinor-settlement-parsing");

beforeEach(async () => {
  await resetTestDb();
});

async function seedManagerFarmAndSale() {
  const [managerRole] = await testDb
    .insert(role)
    .values({ name: "manager" })
    .returning();
  const [seededFarmGroup] = await testDb
    .insert(farm)
    .values({ name: "San Antonio" })
    .returning();
  const [seededFarm] = await testDb
    .insert(establishment)
    .values({ farmId: seededFarmGroup.id, name: "San Antonio" })
    .returning();
  const [manager] = await testDb
    .insert(userAccount)
    .values({
      name: "Manager",
      email: "manager@example.com",
      passwordHash: "hashed",
      roleId: managerRole.id,
    })
    .returning();
  await testDb
    .insert(userFarm)
    .values({ userId: manager.id, farmId: seededFarmGroup.id });
  vi.mocked(auth).mockResolvedValue({
    user: { id: manager.id, role: "manager" },
  } as never);

  const [batch] = await testDb
    .insert(batchOperation)
    .values({
      eventType: "sale",
      establishmentId: seededFarm.id,
      animalCount: 1,
      createdBy: manager.id,
    })
    .returning();
  const [createdAnimal] = await testDb.insert(animal).values({}).returning();
  await testDb
    .insert(animalTagHistory)
    .values({ animalId: createdAnimal.id, tag: "858000064429766" });
  const [saleEvent] = await testDb
    .insert(event)
    .values({
      eventType: "sale",
      eventDate: "2026-07-11",
      animalId: createdAnimal.id,
      establishmentId: seededFarm.id,
      batchOperationId: batch.id,
      createdBy: manager.id,
    })
    .returning();
  await testDb
    .insert(eventSale)
    .values({
      eventId: saleEvent.id,
      guideNumber: "D963691",
      buyer: null,
      price: null,
      weightKg: null,
    });

  return { manager, seededFarm, batch };
}

function fakeSettlement(
  overrides: Partial<Awaited<ReturnType<typeof parseCledinorSettlement>>> = {},
) {
  return {
    guideNumber: "D963691",
    weighDate: "2026-07-11",
    total: "23396.21",
    weightKg: "255.52",
    pricePerKg: "5.2189",
    ...overrides,
  };
}

describe("previewSaleSettlement", () => {
  it("finds the matching venta and returns its details", async () => {
    await seedManagerFarmAndSale();
    vi.mocked(parseCledinorSettlement).mockResolvedValue(fakeSettlement());
    const formData = new FormData();
    formData.set("file", new Blob([Buffer.from("fake")]), "liquidacion.pdf");

    const result = await previewSaleSettlement(formData);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.match.establishmentName).toBe("San Antonio");
      expect(result.match.animalTags).toEqual(["858000064429766"]);
    }
  });

  it("returns an error when no venta matches the guide number", async () => {
    await seedManagerFarmAndSale();
    vi.mocked(parseCledinorSettlement).mockResolvedValue(
      fakeSettlement({ guideNumber: "D000000" }),
    );
    const formData = new FormData();
    formData.set("file", new Blob([Buffer.from("fake")]), "liquidacion.pdf");

    const result = await previewSaleSettlement(formData);

    expect(result.ok).toBe(false);
  });

  it("does not disclose a venta at a campo the user has no access to", async () => {
    const { manager } = await seedManagerFarmAndSale();
    // A second campo the manager is NOT assigned to, with its own venta.
    const [otherFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo Ajeno" })
      .returning();
    const [otherFarm] = await testDb
      .insert(establishment)
      .values({ farmId: otherFarmGroup.id, name: "Campo Ajeno" })
      .returning();
    const [otherBatch] = await testDb
      .insert(batchOperation)
      .values({
        eventType: "sale",
        establishmentId: otherFarm.id,
        animalCount: 1,
        createdBy: manager.id,
      })
      .returning();
    const [otherAnimal] = await testDb.insert(animal).values({}).returning();
    await testDb
      .insert(animalTagHistory)
      .values({ animalId: otherAnimal.id, tag: "858000099999999" });
    const [otherEvent] = await testDb
      .insert(event)
      .values({
        eventType: "sale",
        eventDate: "2026-07-12",
        animalId: otherAnimal.id,
        establishmentId: otherFarm.id,
        batchOperationId: otherBatch.id,
        createdBy: manager.id,
      })
      .returning();
    await testDb
      .insert(eventSale)
      .values({
        eventId: otherEvent.id,
        guideNumber: "D777777",
        buyer: "Cledinor S.A.",
        price: "5.27",
        weightKg: "260",
      });

    vi.mocked(parseCledinorSettlement).mockResolvedValue(
      fakeSettlement({ guideNumber: "D777777" }),
    );
    const formData = new FormData();
    formData.set("file", new Blob([Buffer.from("fake")]), "liquidacion.pdf");

    const result = await previewSaleSettlement(formData);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toContain("Campo Ajeno");
      expect(result.error).not.toContain("858000099999999");
    }
  });

  it("surfaces the parser's error when the PDF isn't a recognizable liquidación", async () => {
    await seedManagerFarmAndSale();
    vi.mocked(parseCledinorSettlement).mockRejectedValue(
      new Error("No se encontró el número de guía en la liquidación"),
    );
    const formData = new FormData();
    formData.set("file", new Blob([Buffer.from("fake")]), "liquidacion.pdf");

    const result = await previewSaleSettlement(formData);

    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toBe(
        "No se encontró el número de guía en la liquidación",
      );
  });
});

describe("linkSaleSettlementAction", () => {
  it("re-parses the uploaded file and links it, ignoring any other form fields", async () => {
    const { batch } = await seedManagerFarmAndSale();
    vi.mocked(parseCledinorSettlement).mockResolvedValue(fakeSettlement());
    const formData = new FormData();
    formData.set(
      "file",
      new Blob([Buffer.from("fake-pdf-bytes")]),
      "liquidacion.pdf",
    );

    await linkSaleSettlementAction(formData);

    const [settlement] = await testDb
      .select()
      .from(saleSettlement)
      .where(eq(saleSettlement.batchOperationId, batch.id));
    expect(settlement.guideNumber).toBe("D963691");
  });
});
