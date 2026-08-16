import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { role, userAccount } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { findOrCreateUserForGoogle } = await import("@/lib/dal/user-provisioning");

beforeEach(async () => {
  await resetTestDb();
});

describe("findOrCreateUserForGoogle", () => {
  it("creates a new manager-role user with no password when the email is unknown", async () => {
    await testDb.insert(role).values({ name: "manager" });

    const result = await findOrCreateUserForGoogle("new@example.com", "New Person");

    expect(result.email).toBe("new@example.com");
    expect(result.role).toBe("manager");

    const [stored] = await testDb.select().from(userAccount).where(eq(userAccount.email, "new@example.com"));
    expect(stored.passwordHash).toBeNull();
    expect(stored.name).toBe("New Person");
  });

  it("links to the existing account when the email already has a password", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [existing] = await testDb
      .insert(userAccount)
      .values({ name: "Existing", email: "existing@example.com", passwordHash: "hashed", roleId: managerRole.id })
      .returning();

    const result = await findOrCreateUserForGoogle("existing@example.com", "Google Display Name");

    expect(result.id).toBe(existing.id);
    expect(result.role).toBe("manager");

    const rows = await testDb.select().from(userAccount).where(eq(userAccount.email, "existing@example.com"));
    expect(rows).toHaveLength(1);
    expect(rows[0].passwordHash).toBe("hashed");
  });

  it("throws if the manager role has not been seeded", async () => {
    await expect(findOrCreateUserForGoogle("nobody@example.com", "Nobody")).rejects.toThrow(
      'Role "manager" not found'
    );
  });
});
