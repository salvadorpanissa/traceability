import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { role, userAccount } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { getOrCreateSystemUser } = await import("@/lib/dal/system-user");

beforeEach(async () => {
  await resetTestDb();
});

describe("getOrCreateSystemUser", () => {
  it("creates a system user on first call and reuses it on subsequent calls", async () => {
    await testDb.insert(role).values({ name: "admin" });

    const firstId = await getOrCreateSystemUser();
    const secondId = await getOrCreateSystemUser();

    expect(firstId).toBe(secondId);
    const [stored] = await testDb.select().from(userAccount).where(eq(userAccount.id, firstId));
    expect(stored.email).toBe("sistema@interno.local");
    expect(stored.name).toBe("Sistema (recategorización automática)");
  });

  it("prefers the admin role when multiple roles exist", async () => {
    await testDb.insert(role).values([{ name: "manager" }, { name: "admin" }]);
    const [adminRole] = await testDb.select().from(role).where(eq(role.name, "admin"));

    const systemUserId = await getOrCreateSystemUser();

    const [stored] = await testDb.select().from(userAccount).where(eq(userAccount.id, systemUserId));
    expect(stored.roleId).toBe(adminRole.id);
  });

  it("throws a clear error when no role exists yet", async () => {
    await expect(getOrCreateSystemUser()).rejects.toThrow("corré npm run db:seed primero");
  });
});
