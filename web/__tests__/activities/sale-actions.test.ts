// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { role, farm, userAccount, userFarm, dicoseRegistration, owner, ownTag, event, eventSale } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/activities/snig-guide-parsing", () => ({
  parseSnigGuide: vi.fn(),
}));

const { previewSaleBatchFromPdf, confirmSaleBatchFromPdfAction, createOwnerAction } = await import(
  "../../app/(protected)/activities/sale/actions"
);
const { auth } = await import("@/auth");
const { parseSnigGuide } = await import("@/lib/activities/snig-guide-parsing");

beforeEach(async () => {
  await resetTestDb();
});

async function seedManagerAndFarm() {
  const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
  const [seededFarm] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
  const [manager] = await testDb
    .insert(userAccount)
    .values({ name: "Manager", email: "manager@example.com", passwordHash: "hashed", roleId: managerRole.id })
    .returning();
  await testDb.insert(userFarm).values({ userId: manager.id, farmId: seededFarm.id });
  // dicose_registration.owner_id is NOT NULL in this schema — the brief's
  // seed omitted it; seed a placeholder owner to satisfy the constraint
  // (same class of fix applied in prior tasks' test seeds).
  const [seededOwner] = await testDb.insert(owner).values({ name: "Dueño Sembrado" }).returning();
  const [seededRegistration] = await testDb
    .insert(dicoseRegistration)
    .values({ ownerId: seededOwner.id, farmId: seededFarm.id, dicoseCode: "111111111" })
    .returning();
  // resolveBatchRows only reports "new" (vs "foreign") for tags already
  // registered as own_tag on the operating farm — the brief's seed omitted
  // this, which made the fakeGuide's tag resolve as "foreign" instead of the
  // expected "new". Seed it to match the guide fixture's tag.
  await testDb
    .insert(ownTag)
    .values({ tag: "AR000000000300", dicoseRegistrationId: seededRegistration.id });

  vi.mocked(auth).mockResolvedValue({ user: { id: manager.id, role: "manager" } } as never);

  return { manager, seededFarm };
}

function fakeGuide(overrides: Partial<Awaited<ReturnType<typeof parseSnigGuide>>> = {}) {
  return {
    guideNumber: "D963691",
    eventDate: "2026-02-01",
    originDicoseCode: "111111111",
    destinationDicoseCode: "999999999",
    animals: [{ tag: "AR000000000300", sex: "H", ageMonths: 36 }],
    ...overrides,
  };
}

describe("previewSaleBatchFromPdf", () => {
  it("resolves the origin farm from the guide's origin DICOSE and does not error when the destination DICOSE matches no farm", async () => {
    await seedManagerAndFarm();
    vi.mocked(parseSnigGuide).mockResolvedValue(fakeGuide());
    const formData = new FormData();
    formData.set("file", new Blob([Buffer.from("fake")]), "guia.pdf");

    const result = await previewSaleBatchFromPdf(formData);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.originFarmName).toBe("Campo Norte");
      expect(result.guideNumber).toBe("D963691");
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe("new");
      expect(result.withdrawalWarnings).toEqual([]);
    }
  });

  it("returns an error when the origin DICOSE has no registered farm", async () => {
    await seedManagerAndFarm();
    vi.mocked(parseSnigGuide).mockResolvedValue(fakeGuide({ originDicoseCode: "000000000" }));
    const formData = new FormData();
    formData.set("file", new Blob([Buffer.from("fake")]), "guia.pdf");

    const result = await previewSaleBatchFromPdf(formData);

    expect(result.ok).toBe(false);
  });

  it("returns an error surfaced by parseSnigGuide when the PDF isn't a recognizable guide", async () => {
    await seedManagerAndFarm();
    vi.mocked(parseSnigGuide).mockRejectedValue(new Error("No se encontró el número de guía en el PDF"));
    const formData = new FormData();
    formData.set("file", new Blob([Buffer.from("fake")]), "guia.pdf");

    const result = await previewSaleBatchFromPdf(formData);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("No se encontró el número de guía en el PDF");
  });
});

describe("confirmSaleBatchFromPdfAction", () => {
  it("creates the sale batch with the guide PDF, buyer/price/weight, and forcedWithdrawalTags", async () => {
    const { seededFarm } = await seedManagerAndFarm();

    const formData = new FormData();
    formData.set("originFarmId", seededFarm.id);
    formData.set("guideNumber", "D963691");
    formData.set("eventDate", "2026-02-01");
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
    formData.set("file", new Blob([Buffer.from("fake-pdf")]), "guia.pdf");

    await confirmSaleBatchFromPdfAction(formData);

    const saleEvents = await testDb.select().from(event).where(eq(event.eventType, "sale"));
    expect(saleEvents).toHaveLength(1);
    const [saleRow] = await testDb.select().from(eventSale).where(eq(eventSale.eventId, saleEvents[0].id));
    expect(saleRow.guideNumber).toBe("D963691");
    expect(saleRow.buyer).toBe("Cledinor S.A.");
  });
});

describe("createOwnerAction", () => {
  it("creates an owner and returns it", async () => {
    await seedManagerAndFarm();

    const created = await createOwnerAction("AIP");

    expect(created.name).toBe("AIP");
    const [stored] = await testDb.select().from(owner).where(eq(owner.name, "AIP"));
    expect(stored).toBeDefined();
  });
});
