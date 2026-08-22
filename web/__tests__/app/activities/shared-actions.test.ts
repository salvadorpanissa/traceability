// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { columnHeaderMeaning, role, userAccount } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { parseActivityFileAction } = await import("../../../app/(protected)/activities/shared-actions");
const { auth } = await import("@/auth");

let userId: string;

beforeEach(async () => {
  await resetTestDb();
  const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
  const [manager] = await testDb
    .insert(userAccount)
    .values({ name: "Manager", email: "manager@example.com", passwordHash: "hashed", roleId: managerRole.id })
    .returning();
  userId = manager.id;
  vi.mocked(auth).mockResolvedValue({ user: { id: userId, role: "manager" } } as never);
});

async function buildWorkbookBuffer(headers: string[], rows: string[][]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(headers);
  for (const r of rows) sheet.addRow(r);
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

describe("parseActivityFileAction", () => {
  it("parses headers and rows without requiring any establishment/farm", async () => {
    const buffer = await buildWorkbookBuffer(["IDE", "Fecha"], [["AR1", "2026-02-01"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");

    const result = await parseActivityFileAction(formData);

    expect(result.headers).toEqual(["IDE", "Fecha"]);
    expect(result.rows).toEqual([["AR1", "2026-02-01"]]);
    expect(result.initialMapping).toBeNull();
  });

  it("pre-fills the mapping from remembered header meanings", async () => {
    await testDb.insert(columnHeaderMeaning).values({ header: "IDE", meaning: "tag" });
    const buffer = await buildWorkbookBuffer(["IDE"], [["AR1"]]);
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "lote.xlsx");

    const result = await parseActivityFileAction(formData);

    expect(result.initialMapping).toEqual([{ header: "IDE", meaning: "tag" }]);
  });
});
