// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { buildSnigGuideFixturePdf } from "../../test/snig-guide-fixture";
import {
  farm,
  role,
  establishment,
  userAccount,
  owner,
  dicose,
  ownTag,
  eventTransfer,
  animal,
  batchOperation,
} from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { auth } = await import("@/auth");
const { previewTransferBatchFromPdf, confirmTransferBatchFromPdfAction } =
  await import("@/app/(protected)/activities/transfer/actions");

beforeEach(async () => {
  await resetTestDb();
});

async function seedAdminSession() {
  const [adminRole] = await testDb
    .insert(role)
    .values({ name: "admin" })
    .returning();
  const [user] = await testDb
    .insert(userAccount)
    .values({
      name: "Admin",
      email: "admin@example.com",
      passwordHash: "hashed",
      roleId: adminRole.id,
    })
    .returning();
  vi.mocked(auth).mockResolvedValue({
    user: { id: user.id, role: "admin" },
  } as never);
  return user;
}

function pdfFormData(buffer: ArrayBuffer): FormData {
  const formData = new FormData();
  formData.set(
    "file",
    new File([buffer], "guide.pdf", { type: "application/pdf" }),
  );
  return formData;
}

describe("previewTransferBatchFromPdf", () => {
  it("resolves origin/destination farms from DICOSE and returns the parsed rows", async () => {
    await seedAdminSession();
    const [seededOwner] = await testDb
      .insert(owner)
      .values({ name: "AIP" })
      .returning();
    const [originFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo San Antonio" })
      .returning();
    const [originFarm] = await testDb
      .insert(establishment)
      .values({ farmId: originFarmGroup.id, name: "Campo San Antonio" })
      .returning();
    const [destinationFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Cuatro Cerros" })
      .returning();
    const [destinationFarm] = await testDb
      .insert(establishment)
      .values({ farmId: destinationFarmGroup.id, name: "Cuatro Cerros" })
      .returning();
    const [originRegistration] = await testDb
      .insert(dicose)
      .values({
        ownerId: seededOwner.id,
        establishmentId: originFarm.id,
        dicoseCode: "151400442",
      })
      .returning();
    const [destinationRegistration] = await testDb
      .insert(dicose)
      .values({
        ownerId: seededOwner.id,
        establishmentId: destinationFarm.id,
        dicoseCode: "151518192",
      })
      .returning();
    await testDb
      .insert(ownTag)
      .values({
        tag: "858000031330866",
        dicoseId: destinationRegistration.id,
      });

    const buffer = await buildSnigGuideFixturePdf({
      guideNumber: "D838153",
      eventDateDisplay: "11/07/2026",
      dicoseA: "151400442",
      dicoseB: "151518192",
      dicoseC: "151400442",
      dicoseD: "151518192",
      animals: [{ tag: "858000031330866", sex: "H", ageMonths: 90 }],
    });

    const result = await previewTransferBatchFromPdf(pdfFormData(buffer));

    expect(result).toEqual({
      ok: true,
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
    expect(originRegistration.establishmentId).toBe(originFarm.id); // sanity: the seeded fixture is coherent
  });

  it("returns a friendly error when a DICOSE code has no registered establishment", async () => {
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

    const result = await previewTransferBatchFromPdf(pdfFormData(buffer));

    expect(result).toEqual({
      ok: false,
      error: "No hay ningún campo registrado con DICOSE 999999999",
    });
  });

  it("returns a friendly error when the PDF isn't a recognizable guide", async () => {
    await seedAdminSession();
    const notAGuide = new TextEncoder().encode(
      "%PDF-1.4\nnot a real guide",
    ).buffer;

    const result = await previewTransferBatchFromPdf(pdfFormData(notAGuide));

    expect(result.ok).toBe(false);
  });
});

describe("confirmTransferBatchFromPdfAction", () => {
  it("confirms the batch with the explicit origin establishment and guide number, and persists the uploaded guide document", async () => {
    await seedAdminSession();
    const [seededOwner] = await testDb
      .insert(owner)
      .values({ name: "AIP" })
      .returning();
    const [originFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Campo San Antonio" })
      .returning();
    const [originFarm] = await testDb
      .insert(establishment)
      .values({ farmId: originFarmGroup.id, name: "Campo San Antonio" })
      .returning();
    const [destinationFarmGroup] = await testDb
      .insert(farm)
      .values({ name: "Cuatro Cerros" })
      .returning();
    const [destinationFarm] = await testDb
      .insert(establishment)
      .values({ farmId: destinationFarmGroup.id, name: "Cuatro Cerros" })
      .returning();
    const [destinationRegistration] = await testDb
      .insert(dicose)
      .values({
        ownerId: seededOwner.id,
        establishmentId: destinationFarm.id,
        dicoseCode: "151518192",
      })
      .returning();
    await testDb
      .insert(ownTag)
      .values({
        tag: "858000031330866",
        dicoseId: destinationRegistration.id,
      });

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
    formData.set(
      "file",
      new File([buffer], "guide.pdf", { type: "application/pdf" }),
    );
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
      ]),
    );

    await confirmTransferBatchFromPdfAction(formData);

    const [createdEventTransfer] = await testDb.select().from(eventTransfer);
    expect(createdEventTransfer.originEstablishmentId).toBe(originFarm.id);
    expect(createdEventTransfer.destinationEstablishmentId).toBe(destinationFarm.id);
    expect(createdEventTransfer.guideNumber).toBe("D838153");
    const [createdAnimal] = await testDb.select().from(animal);
    expect(createdAnimal.birthDate).toBe("2019-01-01");

    const [createdBatch] = await testDb.select().from(batchOperation);
    expect(createdBatch.guideFileName).toBe("guide.pdf");
    expect(createdBatch.guideMimeType).toBe("application/pdf");
    expect(Buffer.from(createdBatch.guideFileData as Buffer)).toEqual(
      Buffer.from(buffer),
    );
  });
});
