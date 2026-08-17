// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dal/session", () => ({ requireSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirected");
  }),
}));

const { requireSession } = await import("@/lib/dal/session");
const { redirect } = await import("next/navigation");
const SettingsLayout = (await import("../../app/(protected)/settings/layout")).default;

describe("SettingsLayout", () => {
  it("redirects an admin session to /dashboard instead of rendering the sidebar", async () => {
    vi.mocked(requireSession).mockResolvedValue({ user: { id: "u1", role: "admin" } } as never);

    await expect(SettingsLayout({ children: <p>contenido</p> })).rejects.toThrow("redirected");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("renders for a manager session", async () => {
    vi.mocked(requireSession).mockResolvedValue({ user: { id: "u1", role: "manager" } } as never);

    const result = await SettingsLayout({ children: <p>contenido</p> });
    expect(result).toBeTruthy();
  });
});
