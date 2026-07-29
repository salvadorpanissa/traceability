// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { role, farm, userAccount } from "@/db/schema";
import type { MappedImportRow } from "@/lib/activities/bulk-import-mapping";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { parseImportFileAction, importChunkAction } = await import("../../../app/(protected)/settings/import/actions");
const { auth } = await import("@/auth");

beforeEach(async () => {
  await resetTestDb();
});

async function seedSession(roleName: "admin" | "manager") {
  const [seededRole] = await testDb.insert(role).values({ name: roleName }).returning();
  const [user] = await testDb
    .insert(userAccount)
    .values({ name: "User", email: `${roleName}@example.com`, passwordHash: "hashed", roleId: seededRole.id })
    .returning();
  vi.mocked(auth).mockResolvedValue({ user: { id: user.id, role: roleName } } as never);
  return user;
}

describe("parseImportFileAction", () => {
  it("rejects a non-admin session", async () => {
    await seedSession("manager");
    const formData = new FormData();
    formData.set("file", new File(["x"], "f.xlsx"));
    await expect(parseImportFileAction(formData)).rejects.toThrow();
  });
});

describe("importChunkAction", () => {
  it("rejects a non-admin session", async () => {
    await seedSession("manager");
    await expect(importChunkAction([])).rejects.toThrow();
  });

  it("returns createdCount and errors for a mix of valid and invalid rows", async () => {
    await seedSession("admin");
    await testDb.insert(farm).values({ name: "San Antonio" });

    const rows: MappedImportRow[] = [
      {
        tag: "TAG1",
        secondaryTag: null,
        ownerName: "SASG",
        farmName: "San Antonio",
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
        farmName: null,
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
});
