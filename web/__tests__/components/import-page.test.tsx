// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dal/session", () => ({ requireSession: vi.fn() }));

const { requireSession } = await import("@/lib/dal/session");
const ImportSettingsPage = (await import("../../app/(protected)/settings/import/page")).default;

describe("ImportSettingsPage", () => {
  it("renders for a manager session", async () => {
    vi.mocked(requireSession).mockResolvedValue({ user: { id: "u1", role: "manager" } } as never);

    const result = await ImportSettingsPage();
    expect(result).toBeTruthy();
  });

  it("renders for an admin session", async () => {
    vi.mocked(requireSession).mockResolvedValue({ user: { id: "u1", role: "admin" } } as never);

    const result = await ImportSettingsPage();
    expect(result).toBeTruthy();
  });
});
