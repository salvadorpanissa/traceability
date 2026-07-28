import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { loginAttempt } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { isLoginLocked, recordFailedLogin } = await import("@/lib/dal/login-attempts");

beforeEach(async () => {
  await resetTestDb();
});

describe("isLoginLocked", () => {
  it("is not locked with no prior failed attempts", async () => {
    expect(await isLoginLocked("user@example.com")).toBe(false);
  });

  it("locks after 5 failed attempts within the window", async () => {
    for (let i = 0; i < 4; i++) await recordFailedLogin("user@example.com");
    expect(await isLoginLocked("user@example.com")).toBe(false);

    await recordFailedLogin("user@example.com");
    expect(await isLoginLocked("user@example.com")).toBe(true);
  });

  it("is case-insensitive on the email", async () => {
    for (let i = 0; i < 5; i++) await recordFailedLogin("User@Example.com");
    expect(await isLoginLocked("user@example.com")).toBe(true);
  });

  it("does not lock a different email", async () => {
    for (let i = 0; i < 5; i++) await recordFailedLogin("attacker@example.com");
    expect(await isLoginLocked("victim@example.com")).toBe(false);
  });

  it("ignores attempts outside the lockout window", async () => {
    const oldAttempts = Array.from({ length: 5 }, () => ({
      email: "user@example.com",
      attemptedAt: new Date(Date.now() - 60 * 60 * 1000),
    }));
    await testDb.insert(loginAttempt).values(oldAttempts);

    expect(await isLoginLocked("user@example.com")).toBe(false);
  });
});
