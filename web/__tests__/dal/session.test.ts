import { describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
import { requireSession } from "@/lib/dal/session";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

const { auth } = await import("@/auth");
// `auth` is overloaded (plain call vs. middleware call), which makes
// vi.mocked(auth).mockResolvedValue resolve against the middleware overload
// instead of the one actually used here. Narrow to the signature this test
// needs before wrapping it.
const mockedAuth = auth as unknown as () => Promise<Session | null>;

describe("requireSession", () => {
  it("returns the session when authenticated", async () => {
    vi.mocked(mockedAuth).mockResolvedValue({
      user: { id: "user-1", email: "a@example.com", role: "admin" },
    } as Session);

    const session = await requireSession();
    expect(session.user.id).toBe("user-1");
  });

  it("redirects to /login when there is no session", async () => {
    vi.mocked(mockedAuth).mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT");
  });
});
