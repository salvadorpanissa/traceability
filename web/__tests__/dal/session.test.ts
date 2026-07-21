import { describe, expect, it, vi } from "vitest";
import { requireSession } from "@/lib/dal/session";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

const { auth } = await import("@/auth");

describe("requireSession", () => {
  it("returns the session when authenticated", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", email: "a@example.com", role: "admin" },
    } as never);

    const session = await requireSession();
    expect(session.user.id).toBe("user-1");
  });

  it("throws when there is no session", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow("No autenticado");
  });
});
