// @vitest-environment node
// See __tests__/activities/transfer-actions.test.ts for why this suite needs
// the plain Node environment instead of the project's default jsdom.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import ExcelJS from "exceljs";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { refreshDerivedState } from "../../test/refresh-derived-state";
import {
  farm,
  role,
  establishment,
  userAccount,
  userFarm,
  category,
  animal,
  animalTagHistory,
  batchOperation,
  event,
  eventTransfer,
  eventRecategorize,
} from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

async function buildWorkbookBuffer(
  headers: string[],
  rows: string[][],
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(headers);
  for (const r of rows) sheet.addRow(r);
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

const { auth } = await import("@/auth");
const { previewRecategorizeBatch, confirmRecategorizeBatchAction } =
  await import("@/app/(protected)/activities/recategorize/actions");

beforeEach(async () => {
  await resetTestDb();
});

async function seedManagerAndFarm() {
  const [managerRole] = await testDb
    .insert(role)
    .values({ name: "manager" })
    .returning();
  const [seededFarmGroup] = await testDb
    .insert(farm)
    .values({ name: "Campo Norte" })
    .returning();
  const [seededFarm] = await testDb
    .insert(establishment)
    .values({ farmId: seededFarmGroup.id, name: "Campo Norte" })
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
  return { manager, seededFarm, seededFarmGroup };
}

async function seedAnimalAtFarm(
  establishmentId: string,
  adminId: string,
  tag: string,
  categoryId: string,
) {
  const [createdAnimal] = await testDb.insert(animal).values({}).returning();
  await testDb
    .insert(animalTagHistory)
    .values({ animalId: createdAnimal.id, tag });

  const [batch] = await testDb
    .insert(batchOperation)
    .values({
      eventType: "transfer",
      establishmentId,
      animalCount: 1,
      createdBy: adminId,
    })
    .returning();
  const [transferEvent] = await testDb
    .insert(event)
    .values({
      eventType: "transfer",
      eventDate: "2026-01-01",
      animalId: createdAnimal.id,
      establishmentId,
      batchOperationId: batch.id,
      createdBy: adminId,
    })
    .returning();
  await testDb
    .insert(eventTransfer)
    .values({
      eventId: transferEvent.id,
      originEstablishmentId: establishmentId,
      destinationEstablishmentId: establishmentId,
    });

  const [recatEvent] = await testDb
    .insert(event)
    .values({
      eventType: "recategorize",
      eventDate: "2026-01-01",
      animalId: createdAnimal.id,
      establishmentId,
      batchOperationId: batch.id,
      createdBy: adminId,
    })
    .returning();
  await testDb
    .insert(eventRecategorize)
    .values({
      eventId: recatEvent.id,
      oldCategoryId: categoryId,
      newCategoryId: categoryId,
    });

  return createdAnimal;
}

async function excelFormData(
  rows: string[][],
  farmId: string,
  headers: string[] = ["Caravana", "Fecha"],
): Promise<FormData> {
  const buffer = await buildWorkbookBuffer(headers, rows);
  const formData = new FormData();
  formData.set("file", new Blob([buffer]), "lote.xlsx");
  formData.set("farmId", farmId);
  return formData;
}

describe("previewRecategorizeBatch", () => {
  it("resolves rows once tag/date columns are mapped", async () => {
    const { manager, seededFarm, seededFarmGroup } = await seedManagerAndFarm();
    const [novillo] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Novillo" })
      .returning();
    await seedAnimalAtFarm(seededFarm.id, manager.id, "AR1", novillo.id);
    await refreshDerivedState();

    const formData = await excelFormData([["AR1", "2026-03-01"]], seededFarmGroup.id);
    formData.set(
      "mapping",
      JSON.stringify([
        { header: "Caravana", meaning: "tag" },
        { header: "Fecha", meaning: "date" },
      ]),
    );

    const result = await previewRecategorizeBatch(formData);

    expect(result).toMatchObject({
      mappingNeeded: false,
      eventDateNeeded: false,
      rows: [
        {
          tag: "AR1",
          status: "existing",
          currentCategoryId: novillo.id,
          currentCategoryName: "Novillo",
        },
      ],
    });
  });

  it("rejects the whole batch when the manager has no access to the chosen farm group", async () => {
    await seedManagerAndFarm();
    const [foreignGroup] = await testDb.insert(farm).values({ name: "Grupo Ajeno" }).returning();

    const formData = await excelFormData([["AR1", "2026-03-01"]], foreignGroup.id);
    formData.set(
      "mapping",
      JSON.stringify([
        { header: "Caravana", meaning: "tag" },
        { header: "Fecha", meaning: "date" },
      ]),
    );

    await expect(previewRecategorizeBatch(formData)).rejects.toThrow("No tenés acceso a este grupo de campos");
  });

  it("errors a row whose animal is on a different farm group than the one chosen", async () => {
    const { manager, seededFarm, seededFarmGroup } = await seedManagerAndFarm();
    const [foreignGroup] = await testDb.insert(farm).values({ name: "Grupo Ajeno" }).returning();
    const [foreignFarm] = await testDb.insert(establishment).values({ farmId: foreignGroup.id, name: "Campo Ajeno" }).returning();
    const [novillo] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Novillo" })
      .returning();
    await seedAnimalAtFarm(seededFarm.id, manager.id, "AR1", novillo.id);
    // Same manager id as creator (only a FK filler) — the point is this animal
    // lives on foreignFarm, in a different farm group than the one picked in
    // the form.
    await seedAnimalAtFarm(foreignFarm.id, manager.id, "AR9", novillo.id);
    await refreshDerivedState();

    const formData = await excelFormData(
      [
        ["AR1", "2026-03-01"],
        ["AR9", "2026-03-01"],
      ],
      seededFarmGroup.id,
    );
    formData.set(
      "mapping",
      JSON.stringify([
        { header: "Caravana", meaning: "tag" },
        { header: "Fecha", meaning: "date" },
      ]),
    );

    const result = await previewRecategorizeBatch(formData);

    expect(result).toMatchObject({
      mappingNeeded: false,
      eventDateNeeded: false,
      rows: [
        { tag: "AR1", status: "existing", currentCategoryId: novillo.id },
        { tag: "AR9", status: "error", reason: "El animal no pertenece a este grupo de campos" },
      ],
    });
  });

  it("asks for a column mapping the first time a header signature is seen", async () => {
    const { seededFarmGroup } = await seedManagerAndFarm();

    const formData = await excelFormData([["AR1", "2026-03-01"]], seededFarmGroup.id);

    const result = await previewRecategorizeBatch(formData);

    expect(result).toMatchObject({
      mappingNeeded: true,
      headers: ["Caravana", "Fecha"],
    });
  });
});

describe("confirmRecategorizeBatchAction", () => {
  it("persists the mapping and confirms the batch", async () => {
    const { manager, seededFarm, seededFarmGroup } = await seedManagerAndFarm();
    const [novillo] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Novillo" })
      .returning();
    const [novilloPlus3] = await testDb
      .insert(category)
      .values({ farmId: seededFarmGroup.id, name: "Novillo +3 años" })
      .returning();
    const createdAnimal = await seedAnimalAtFarm(
      seededFarm.id,
      manager.id,
      "AR1",
      novillo.id,
    );
    // confirmRecategorizeBatch re-reads campo/categoría from
    // animal_current_state, so the seeded events have to be visible there.
    await refreshDerivedState();

    await confirmRecategorizeBatchAction({
      mapping: [
        { header: "Caravana", meaning: "tag" },
        { header: "Fecha", meaning: "date" },
      ],
      farmId: seededFarmGroup.id,
      targetCategoryId: novilloPlus3.id,
      rows: [
        {
          tag: "AR1",
          eventDate: "2026-03-01",
          notes: null,
          status: "existing",
          animalId: createdAnimal.id,
          currentEstablishmentId: seededFarm.id,
          currentCategoryId: novillo.id,
          currentCategoryName: "Novillo",
          sex: null,
        },
      ],
      unresolvableDecisions: {},
      sexMismatchDecisions: {},
    });

    // seedAnimalAtFarm already wrote one "initial" recategorize event (novillo
    // -> novillo, self-assignment) — the action must add a second, distinct
    // event carrying the real transition, not reuse/overwrite the first one.
    const recategorizeEvents = (
      await testDb
        .select()
        .from(event)
        .where(eq(event.animalId, createdAnimal.id))
    ).filter((e) => e.eventType === "recategorize");
    expect(recategorizeEvents).toHaveLength(2);

    const recatRows = await testDb
      .select()
      .from(eventRecategorize)
      .where(
        inArray(
          eventRecategorize.eventId,
          recategorizeEvents.map((e) => e.id),
        ),
      );
    const manualRecat = recatRows.find((r) => r.source === "manual");
    expect(manualRecat).toMatchObject({
      oldCategoryId: novillo.id,
      newCategoryId: novilloPlus3.id,
      source: "manual",
    });
  });
});
