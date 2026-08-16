import { describe, expect, it, vi, beforeEach } from "vitest";

const signInMock = vi.fn<(...args: unknown[]) => Promise<undefined>>(async () => undefined);
const isLoginLockedMock = vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => false);
const recordFailedLoginMock = vi.fn<(...args: unknown[]) => Promise<undefined>>(async () => undefined);

vi.mock("@/auth", () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
}));

vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {},
}));

vi.mock("@/lib/dal/login-attempts", () => ({
  isLoginLocked: (...args: unknown[]) => isLoginLockedMock(...args),
  recordFailedLogin: (...args: unknown[]) => recordFailedLoginMock(...args),
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
    isLoginLockedMock.mockClear();
    isLoginLockedMock.mockResolvedValue(false);
    recordFailedLoginMock.mockClear();
  });

  it("rejects with a generic message when the account is locked, without attempting sign-in", async () => {
    isLoginLockedMock.mockResolvedValue(true);
    const formData = buildFormData({ email: "user@example.com", password: "correct-password" });

    const result = await loginAction({ error: null }, formData);

    expect(result.error).toBe("Demasiados intentos. Probá de nuevo en unos minutos.");
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("records a failed attempt when the credentials are wrong", async () => {
    const { AuthError } = await import("next-auth");
    signInMock.mockRejectedValueOnce(new AuthError("bad credentials"));
    const formData = buildFormData({ email: "user@example.com", password: "wrong-password" });

    const result = await loginAction({ error: null }, formData);

    expect(result.error).toBe("Email o contraseña incorrectos");
    expect(recordFailedLoginMock).toHaveBeenCalledWith("user@example.com");
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
      returnTo: "/select-establishment",
    });

    await loginAction({ error: null }, formData);

    expect(signInMock).toHaveBeenCalledWith(
      "credentials",
      expect.objectContaining({ redirectTo: "/select-establishment" }),
    );
  });

  it("falls back to /dashboard when returnTo uses a backslash to smuggle a host (single backslash)", async () => {
    const formData = buildFormData({
      email: "user@example.com",
      password: "correct-password",
      returnTo: "/\\evil.com",
    });

    await loginAction({ error: null }, formData);

    expect(signInMock).toHaveBeenCalledWith(
      "credentials",
      expect.objectContaining({ redirectTo: "/dashboard" }),
    );
  });

  it("falls back to /dashboard when returnTo uses a backslash-slash mix to smuggle a host", async () => {
    const formData = buildFormData({
      email: "user@example.com",
      password: "correct-password",
      returnTo: "/\\/evil.com",
    });

    await loginAction({ error: null }, formData);

    expect(signInMock).toHaveBeenCalledWith(
      "credentials",
      expect.objectContaining({ redirectTo: "/dashboard" }),
    );
  });
});

describe("googleSignInAction", () => {
  beforeEach(() => {
    signInMock.mockClear();
  });

  it("signs in with the google provider and a safe redirect", async () => {
    const { googleSignInAction } = await import("@/app/login/actions");

    await googleSignInAction("/select-establishment");

    expect(signInMock).toHaveBeenCalledWith("google", { redirectTo: "/select-establishment" });
  });

  it("falls back to /dashboard for an unsafe returnTo", async () => {
    const { googleSignInAction } = await import("@/app/login/actions");

    await googleSignInAction("//evil.com");

    expect(signInMock).toHaveBeenCalledWith("google", { redirectTo: "/dashboard" });
  });

  it("falls back to /dashboard when returnTo is null", async () => {
    const { googleSignInAction } = await import("@/app/login/actions");

    await googleSignInAction(null);

    expect(signInMock).toHaveBeenCalledWith("google", { redirectTo: "/dashboard" });
  });
});
