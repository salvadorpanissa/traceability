import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { role, userAccount } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

const { requireSession } = await import("@/lib/dal/session");
const { auth } = await import("@/auth");
// `auth` is overloaded (plain call vs. middleware call), which makes
// vi.mocked(auth).mockResolvedValue resolve against the middleware overload
// instead of the one actually used here. Narrow to the signature this test
// needs before wrapping it.
const mockedAuth = auth as unknown as () => Promise<Session | null>;

beforeEach(async () => {
  await resetTestDb();
});

describe("requireSession", () => {
  it("returns the session with the role re-derived from the DB", async () => {
    const [adminRole] = await testDb.insert(role).values({ name: "admin" }).returning();
    const [user] = await testDb
      .insert(userAccount)
      .values({ name: "Admin", email: "a@example.com", passwordHash: "hashed", roleId: adminRole.id })
      .returning();
    vi.mocked(mockedAuth).mockResolvedValue({
      user: { id: user.id, email: user.email, role: "admin" },
    } as Session);

    const session = await requireSession();
    expect(session.user.id).toBe(user.id);
    expect(session.user.role).toBe("admin");
  });

  it("ignores a role claimed by the JWT that doesn't match the DB", async () => {
    const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
    const [user] = await testDb
      .insert(userAccount)
      .values({ name: "Manager", email: "m@example.com", passwordHash: "hashed", roleId: managerRole.id })
      .returning();
    // Simulates a forged/stale JWT claiming admin for a real, non-admin user.
    vi.mocked(mockedAuth).mockResolvedValue({
      user: { id: user.id, email: user.email, role: "admin" },
    } as Session);

    const session = await requireSession();
    expect(session.user.role).toBe("manager");
  });

  it("redirects to /login when there is no session", async () => {
    vi.mocked(mockedAuth).mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT");
  });

  it("redirects to /login when the session's user no longer exists in the DB", async () => {
    vi.mocked(mockedAuth).mockResolvedValue({
      user: { id: "11111111-1111-1111-1111-111111111111", email: "gone@example.com", role: "admin" },
    } as Session);

    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT");
  });
});
