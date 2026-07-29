// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dal/session", () => ({ requireSession: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("redirected"); }) }));

const { requireSession } = await import("@/lib/dal/session");
const { redirect } = await import("next/navigation");
const ImportSettingsPage = (await import("../../app/(protected)/settings/import/page")).default;

describe("ImportSettingsPage", () => {
  it("redirects a non-admin session instead of rendering the form", async () => {
    vi.mocked(requireSession).mockResolvedValue({ user: { id: "u1", role: "manager" } } as never);

    await expect(ImportSettingsPage()).rejects.toThrow("redirected");
    expect(redirect).toHaveBeenCalledWith("/settings");
  });

  it("renders for an admin session", async () => {
    vi.mocked(requireSession).mockResolvedValue({ user: { id: "u1", role: "admin" } } as never);

    const result = await ImportSettingsPage();
    expect(result).toBeTruthy();
  });
});
