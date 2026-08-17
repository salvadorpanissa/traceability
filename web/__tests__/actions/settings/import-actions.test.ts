// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { farm, role, establishment, userAccount, userFarm } from "@/db/schema";
import type { MappedImportRow } from "@/lib/activities/bulk-import-mapping";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { parseImportFileAction, importChunkAction } =
  await import("../../../app/(protected)/settings/import/actions");
const { auth } = await import("@/auth");

beforeEach(async () => {
  await resetTestDb();
});

async function seedSession(roleName: "admin" | "manager") {
  const [seededRole] = await testDb
    .insert(role)
    .values({ name: roleName })
    .returning();
  const [user] = await testDb
    .insert(userAccount)
    .values({
      name: "User",
      email: `${roleName}@example.com`,
      passwordHash: "hashed",
      roleId: seededRole.id,
    })
    .returning();
  vi.mocked(auth).mockResolvedValue({
    user: { id: user.id, role: roleName },
  } as never);
  return user;
}

describe("parseImportFileAction", () => {
  it("rejects when there's no session at all", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const formData = new FormData();
    formData.set("file", new File(["x"], "f.xlsx"));
    await expect(parseImportFileAction(formData)).rejects.toThrow();
  });
});

describe("importChunkAction", () => {
  it("rejects when there's no session at all", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    await expect(importChunkAction([])).rejects.toThrow();
  });

  it("returns createdCount and errors for a mix of valid and invalid rows", async () => {
    await seedSession("admin");
    const [group1] = await testDb
      .insert(farm)
      .values({ name: "San Antonio" })
      .returning();
    await testDb
      .insert(establishment)
      .values({ farmId: group1.id, name: "San Antonio" });

    const rows: MappedImportRow[] = [
      {
        tag: "TAG1",
        secondaryTag: null,
        ownerName: "SASG",
        establishmentName: "San Antonio",
        paddockName: "Arerunguá",
        categoryName: "Vaca de cría",
        breed: "Hereford",
        sex: "Hembra",
        birthDate: "01/2021",
        eventDate: "2026-06-11",
      },
      {
        tag: "",
        secondaryTag: null,
        ownerName: null,
        establishmentName: null,
        paddockName: null,
        categoryName: null,
        breed: null,
        sex: null,
        birthDate: null,
        eventDate: null,
      },
    ];

    const result = await importChunkAction(rows);

    expect(result.createdCount).toBe(1);
    expect(result.errors).toEqual([{ tag: "", reason: "Falta la caravana" }]);
  });

  it("also works for a manager session, scoped to their own campo", async () => {
    const manager = await seedSession("manager");
    const [group] = await testDb
      .insert(farm)
      .values({ name: "San Antonio" })
      .returning();
    await testDb
      .insert(establishment)
      .values({ farmId: group.id, name: "San Antonio" });
    await testDb.insert(userFarm).values({ userId: manager.id, farmId: group.id });

    const rows: MappedImportRow[] = [
      {
        tag: "TAG2",
        secondaryTag: null,
        ownerName: "SASG",
        establishmentName: "San Antonio",
        paddockName: "Arerunguá",
        categoryName: "Vaca de cría",
        breed: "Hereford",
        sex: "Hembra",
        birthDate: "01/2021",
        eventDate: "2026-06-11",
      },
    ];

    const result = await importChunkAction(rows);

    expect(result.createdCount).toBe(1);
    expect(result.errors).toEqual([]);
  });
});
