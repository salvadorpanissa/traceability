// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { buildSnigGuideFixturePdf } from "../../test/snig-guide-fixture";
import {
  farm,
  role,
  establishment,
  userAccount,
  userFarm,
  owner,
  dicose,
  ownTag,
  eventTransfer,
  event,
  eventSale,
  animal,
  animalTagHistory,
  product,
  batchOperation,
  eventHealth,
} from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { auth } = await import("@/auth");
const { previewGuideAction, confirmGuideAction, createOwnerAction } = await import(
  "@/app/(protected)/activities/transfer/actions"
);

beforeEach(async () => {
  await resetTestDb();
});

async function seedAdminSession() {
  const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
  const [user] = await testDb
    .insert(userAccount)
    .values({ name: "Admin", email: "admin@example.com", passwordHash: "hashed", roleId: adminRole.id })
    .returning();
  vi.mocked(auth).mockResolvedValue({ user: { id: user.id, role: "admin" } } as never);
  return user;
}

function pdfFormData(buffer: ArrayBuffer): FormData {
  const formData = new FormData();
  formData.set("file", new File([buffer], "guide.pdf", { type: "application/pdf" }));
  return formData;
}

describe("previewGuideAction", () => {
  it("resolves origin/destination farms from DICOSE and returns a transfer preview when the destination is a registered establecimiento", async () => {
    await seedAdminSession();
    const [originFarmGroup] = await testDb.insert(farm).values({ name: "Campo San Antonio" }).returning();
    const [seededOwner] = await testDb.insert(owner).values({ name: "AIP", farmId: originFarmGroup.id }).returning();
    const [originFarm] = await testDb
      .insert(establishment)
      .values({ farmId: originFarmGroup.id, name: "Campo San Antonio" })
      .returning();
    const [destinationFarmGroup] = await testDb.insert(farm).values({ name: "Cuatro Cerros" }).returning();
    const [destinationFarm] = await testDb
      .insert(establishment)
      .values({ farmId: destinationFarmGroup.id, name: "Cuatro Cerros" })
      .returning();
    await testDb.insert(dicose).values({
      ownerId: seededOwner.id,
      establishmentId: originFarm.id,
      dicoseCode: "151400442",
    });
    const [destinationRegistration] = await testDb
      .insert(dicose)
      .values({ ownerId: seededOwner.id, establishmentId: destinationFarm.id, dicoseCode: "151518192" })
      .returning();
    await testDb.insert(ownTag).values({ tag: "858000031330866", dicoseId: destinationRegistration.id });

    const buffer = await buildSnigGuideFixturePdf({
      guideNumber: "D838153",
      eventDateDisplay: "11/07/2026",
      dicoseA: "151400442",
      dicoseB: "151518192",
      dicoseC: "151400442",
      dicoseD: "151518192",
      animals: [{ tag: "858000031330866", sex: "H", ageMonths: 90 }],
    });

    const result = await previewGuideAction(pdfFormData(buffer));

    expect(result).toEqual({
      ok: true,
      kind: "transfer",
      guideNumber: "D838153",
      eventDate: "2026-07-11",
      originEstablishmentId: originFarm.id,
      originEstablishmentName: "Campo San Antonio",
      destinationEstablishmentId: destinationFarm.id,
      destinationEstablishmentName: "Cuatro Cerros",
      rows: [
        {
          tag: "858000031330866",
          eventDate: "2026-07-11",
          notes: null,
          reproductiveStatusId: null,
          secondaryTag: null,
          breed: null,
          status: "new",
          categoryId: null,
          sex: "female",
          birthDate: "2019-01-01",
          ownerId: seededOwner.id,
          pendingOwnerName: null,
        },
      ],
    });
  });

  it("returns a sale preview when the destination DICOSE has no registered establecimiento", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [seededFarmGroup] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [seededFarm] = await testDb
      .insert(establishment)
      .values({ farmId: seededFarmGroup.id, name: "Campo Norte" })
      .returning();
    const [manager] = await testDb
      .insert(userAccount)
      .values({ name: "Manager", email: "manager@example.com", passwordHash: "hashed", roleId: managerRole.id })
      .returning();
    await testDb.insert(userFarm).values({ userId: manager.id, farmId: seededFarmGroup.id });
    const [seededOwner] = await testDb
      .insert(owner)
      .values({ name: "Dueño Sembrado", farmId: seededFarmGroup.id })
      .returning();
    const [seededRegistration] = await testDb
      .insert(dicose)
      .values({ ownerId: seededOwner.id, establishmentId: seededFarm.id, dicoseCode: "111111111" })
      .returning();
    await testDb.insert(ownTag).values({ tag: "AR000000000300", dicoseId: seededRegistration.id });
    vi.mocked(auth).mockResolvedValue({ user: { id: manager.id, role: "manager" } } as never);

    const buffer = await buildSnigGuideFixturePdf({
      guideNumber: "D963691",
      eventDateDisplay: "01/02/2026",
      dicoseA: "111111111",
      dicoseB: "999999999",
      dicoseC: "111111111",
      dicoseD: "999999999",
      animals: [{ tag: "AR000000000300", sex: "H", ageMonths: 36 }],
    });

    const result = await previewGuideAction(pdfFormData(buffer));

    expect(result.ok).toBe(true);
    if (result.ok && result.kind === "sale") {
      expect(result.originEstablishmentName).toBe("Campo Norte");
      expect(result.guideNumber).toBe("D963691");
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe("new");
      expect(result.withdrawalWarnings).toEqual([]);
    } else {
      throw new Error("expected a sale preview");
    }
  });

  it("maps a pending withdrawal back to its caravana in withdrawalWarnings for a sale preview", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [seededFarmGroup] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [seededFarm] = await testDb
      .insert(establishment)
      .values({ farmId: seededFarmGroup.id, name: "Campo Norte" })
      .returning();
    const [manager] = await testDb
      .insert(userAccount)
      .values({ name: "Manager", email: "manager@example.com", passwordHash: "hashed", roleId: managerRole.id })
      .returning();
    await testDb.insert(userFarm).values({ userId: manager.id, farmId: seededFarmGroup.id });
    const [seededOwner] = await testDb
      .insert(owner)
      .values({ name: "Dueño Sembrado", farmId: seededFarmGroup.id })
      .returning();
    const [seededRegistration] = await testDb
      .insert(dicose)
      .values({ ownerId: seededOwner.id, establishmentId: seededFarm.id, dicoseCode: "111111111" })
      .returning();
    vi.mocked(auth).mockResolvedValue({ user: { id: manager.id, role: "manager" } } as never);

    const [createdAnimal] = await testDb.insert(animal).values({}).returning();
    await testDb.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: "AR000000000302" });
    await testDb.insert(ownTag).values({ tag: "AR000000000302", dicoseId: seededRegistration.id });
    const [productA] = await testDb
      .insert(product)
      .values({ farmId: seededFarmGroup.id, name: "Ivermectina 1%" })
      .returning();
    const [healthBatch] = await testDb
      .insert(batchOperation)
      .values({ eventType: "health", establishmentId: seededFarm.id, animalCount: 1, createdBy: manager.id })
      .returning();
    const [healthEvent] = await testDb
      .insert(event)
      .values({
        eventType: "health",
        eventDate: "2026-02-01",
        animalId: createdAnimal.id,
        establishmentId: seededFarm.id,
        batchOperationId: healthBatch.id,
        createdBy: manager.id,
      })
      .returning();
    await testDb.insert(eventHealth).values({
      eventId: healthEvent.id,
      productId: productA.id,
      dose: "10",
      doseUnit: "ml",
      route: "subcutánea",
      withdrawalDays: 21,
    });

    const buffer = await buildSnigGuideFixturePdf({
      guideNumber: "D963691",
      eventDateDisplay: "10/02/2026",
      dicoseA: "111111111",
      dicoseB: "999999999",
      dicoseC: "111111111",
      dicoseD: "999999999",
      animals: [{ tag: "AR000000000302", sex: "H", ageMonths: 36 }],
    });

    const result = await previewGuideAction(pdfFormData(buffer));

    expect(result.ok).toBe(true);
    if (result.ok && result.kind === "sale") {
      expect(result.rows[0].status).toBe("existing");
      expect(result.withdrawalWarnings).toEqual([
        { tag: "AR000000000302", productName: "Ivermectina 1%", restrictionEndDate: "2026-02-22" },
      ]);
    } else {
      throw new Error("expected a sale preview");
    }
  });

  it("returns a friendly error when the origin DICOSE has no registered establecimiento", async () => {
    await seedAdminSession();
    const buffer = await buildSnigGuideFixturePdf({
      guideNumber: "D838153",
      eventDateDisplay: "11/07/2026",
      dicoseA: "151400442",
      dicoseB: "151518192",
      dicoseC: "999999999",
      dicoseD: "151518192",
      animals: [{ tag: "858000031330866", sex: "H", ageMonths: 90 }],
    });

    const result = await previewGuideAction(pdfFormData(buffer));

    expect(result).toEqual({ ok: false, error: "No hay ningún campo registrado con DICOSE 999999999" });
  });

  it("returns a friendly error when the PDF isn't a recognizable guide", async () => {
    await seedAdminSession();
    const notAGuide = new TextEncoder().encode("%PDF-1.4\nnot a real guide").buffer;

    const result = await previewGuideAction(pdfFormData(notAGuide));

    expect(result.ok).toBe(false);
  });
});

describe("confirmGuideAction", () => {
  it("confirms a transfer batch with the explicit origin establishment and guide number, and persists the uploaded guide document", async () => {
    await seedAdminSession();
    const [originFarmGroup] = await testDb.insert(farm).values({ name: "Campo San Antonio" }).returning();
    const [seededOwner] = await testDb.insert(owner).values({ name: "AIP", farmId: originFarmGroup.id }).returning();
    const [originFarm] = await testDb
      .insert(establishment)
      .values({ farmId: originFarmGroup.id, name: "Campo San Antonio" })
      .returning();
    const [destinationFarmGroup] = await testDb.insert(farm).values({ name: "Cuatro Cerros" }).returning();
    const [destinationFarm] = await testDb
      .insert(establishment)
      .values({ farmId: destinationFarmGroup.id, name: "Cuatro Cerros" })
      .returning();
    const [destinationRegistration] = await testDb
      .insert(dicose)
      .values({ ownerId: seededOwner.id, establishmentId: destinationFarm.id, dicoseCode: "151518192" })
      .returning();
    await testDb.insert(ownTag).values({ tag: "858000031330866", dicoseId: destinationRegistration.id });

    const buffer = await buildSnigGuideFixturePdf({
      guideNumber: "D838153",
      eventDateDisplay: "11/07/2026",
      dicoseA: "151400442",
      dicoseB: "151518192",
      dicoseC: "151400442",
      dicoseD: "151518192",
      animals: [{ tag: "858000031330866", sex: "H", ageMonths: 90 }],
    });
    const formData = new FormData();
    formData.set("file", new File([buffer], "guide.pdf", { type: "application/pdf" }));
    formData.set("kind", "transfer");
    formData.set("originEstablishmentId", originFarm.id);
    formData.set("destinationEstablishmentId", destinationFarm.id);
    formData.set("guideNumber", "D838153");
    formData.set(
      "rows",
      JSON.stringify([
        {
          tag: "858000031330866",
          eventDate: "2026-07-11",
          notes: null,
          status: "new",
          categoryId: null,
          sex: "female",
          birthDate: "2019-01-01",
          ownerId: seededOwner.id,
          pendingOwnerName: null,
        },
      ])
    );

    await confirmGuideAction(formData);

    const [createdEventTransfer] = await testDb.select().from(eventTransfer);
    expect(createdEventTransfer.originEstablishmentId).toBe(originFarm.id);
    expect(createdEventTransfer.destinationEstablishmentId).toBe(destinationFarm.id);
    expect(createdEventTransfer.guideNumber).toBe("D838153");
    const [createdAnimal] = await testDb.select().from(animal);
    expect(createdAnimal.birthDate).toBe("2019-01-01");

    const [createdBatch] = await testDb.select().from(batchOperation);
    expect(createdBatch.guideFileName).toBe("guide.pdf");
    expect(createdBatch.guideMimeType).toBe("application/pdf");
    expect(Buffer.from(createdBatch.guideFileData as Buffer)).toEqual(Buffer.from(buffer));
  });

  it("creates a sale batch with the guide PDF, buyer/price/weight, and forcedWithdrawalTags", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [seededFarmGroup] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [seededFarm] = await testDb
      .insert(establishment)
      .values({ farmId: seededFarmGroup.id, name: "Campo Norte" })
      .returning();
    const [manager] = await testDb
      .insert(userAccount)
      .values({ name: "Manager", email: "manager@example.com", passwordHash: "hashed", roleId: managerRole.id })
      .returning();
    await testDb.insert(userFarm).values({ userId: manager.id, farmId: seededFarmGroup.id });
    vi.mocked(auth).mockResolvedValue({ user: { id: manager.id, role: "manager" } } as never);

    const formData = new FormData();
    formData.set("file", new Blob([Buffer.from("fake-pdf")]), "guia.pdf");
    formData.set("kind", "sale");
    formData.set("originEstablishmentId", seededFarm.id);
    formData.set("guideNumber", "D963691");
    formData.set("buyer", "Cledinor S.A.");
    formData.set("price", "5.27");
    formData.set("weightKg", "260");
    formData.set("forcedWithdrawalTags", JSON.stringify([]));
    formData.set(
      "rows",
      JSON.stringify([
        {
          tag: "AR000000000301",
          eventDate: "2026-02-01",
          notes: null,
          status: "new",
          categoryId: null,
          sex: null,
          birthDate: null,
          ownerId: null,
          pendingOwnerName: null,
        },
      ])
    );

    await confirmGuideAction(formData);

    const saleEvents = await testDb.select().from(event).where(eq(event.eventType, "sale"));
    expect(saleEvents).toHaveLength(1);
    const [saleRow] = await testDb.select().from(eventSale).where(eq(eventSale.eventId, saleEvents[0].id));
    expect(saleRow.guideNumber).toBe("D963691");
    expect(saleRow.buyer).toBe("Cledinor S.A.");
  });
});

describe("createOwnerAction", () => {
  it("creates an owner and returns it", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [seededFarmGroup] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    const [seededFarm] = await testDb
      .insert(establishment)
      .values({ farmId: seededFarmGroup.id, name: "Campo Norte" })
      .returning();
    const [manager] = await testDb
      .insert(userAccount)
      .values({ name: "Manager", email: "manager@example.com", passwordHash: "hashed", roleId: managerRole.id })
      .returning();
    await testDb.insert(userFarm).values({ userId: manager.id, farmId: seededFarmGroup.id });
    vi.mocked(auth).mockResolvedValue({ user: { id: manager.id, role: "manager" } } as never);

    const created = await createOwnerAction(seededFarm.id, "AIP");

    expect(created.name).toBe("AIP");
    const [stored] = await testDb.select().from(owner).where(eq(owner.name, "AIP"));
    expect(stored).toBeDefined();
  });
});
