import { describe, expect, it, vi, beforeEach } from "vitest";

const signInMock = vi.fn(async () => undefined);

vi.mock("@/auth", () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
}));

vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {},
}));

import { loginAction } from "@/app/login/actions";

function buildFormData(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

describe("loginAction", () => {
  beforeEach(() => {
    signInMock.mockClear();
  });

  it("falls back to /dashboard when returnTo is a protocol-relative URL", async () => {
    const formData = buildFormData({
      email: "user@example.com",
      password: "correct-password",
      returnTo: "//evil.com",
    });

    await loginAction({ error: null }, formData);

    expect(signInMock).toHaveBeenCalledWith(
      "credentials",
      expect.objectContaining({ redirectTo: "/dashboard" }),
    );
  });

  it("passes through a normal same-origin returnTo path unchanged", async () => {
    const formData = buildFormData({
      email: "user@example.com",
      password: "correct-password",
      returnTo: "/select-farm",
    });

    await loginAction({ error: null }, formData);

    expect(signInMock).toHaveBeenCalledWith(
      "credentials",
      expect.objectContaining({ redirectTo: "/select-farm" }),
    );
  });
});
