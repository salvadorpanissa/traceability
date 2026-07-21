import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../test/db";
import { resetTestDb } from "../test/reset-db";
import { role, farm, userAccount, userFarm } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/lib/dal/session", () => ({ requireSession: vi.fn() }));

const { requireSession } = await import("@/lib/dal/session");
const { getSelectableFarms } = await import("@/app/select-farm/actions");

beforeEach(async () => {
  await resetTestDb();
});

describe("getSelectableFarms", () => {
  it("returns only the manager's assigned farms", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [farmNorte] = await testDb.insert(farm).values({ name: "Campo Norte" }).returning();
    await testDb.insert(farm).values({ name: "Campo Sur" });
    const [user] = await testDb
      .insert(userAccount)
      .values({ name: "Manager", email: "m@example.com", passwordHash: "x", roleId: managerRole.id })
      .returning();
    await testDb.insert(userFarm).values({ userId: user.id, farmId: farmNorte.id });

    vi.mocked(requireSession).mockResolvedValue({
      user: { id: user.id, role: "manager" },
    } as never);

    const farms = await getSelectableFarms();
    expect(farms).toEqual([{ id: farmNorte.id, name: "Campo Norte" }]);
  });

  it("returns an empty list for a manager with no assigned farms", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [user] = await testDb
      .insert(userAccount)
      .values({ name: "Sin campo", email: "s@example.com", passwordHash: "x", roleId: managerRole.id })
      .returning();

    vi.mocked(requireSession).mockResolvedValue({
      user: { id: user.id, role: "manager" },
    } as never);

    expect(await getSelectableFarms()).toEqual([]);
  });

  it("returns all farms for an admin", async () => {
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    await testDb.insert(farm).values([{ name: "Campo Norte" }, { name: "Campo Sur" }]);
    const [admin] = await testDb
      .insert(userAccount)
      .values({ name: "Admin", email: "a@example.com", passwordHash: "x", roleId: adminRole.id })
      .returning();

    vi.mocked(requireSession).mockResolvedValue({
      user: { id: admin.id, role: "admin" },
    } as never);

    expect(await getSelectableFarms()).toHaveLength(2);
  });
});
