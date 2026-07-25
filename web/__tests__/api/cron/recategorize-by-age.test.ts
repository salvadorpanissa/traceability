// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { role } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { GET } = await import("../../../app/api/cron/recategorize-by-age/route");

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

beforeEach(async () => {
  await resetTestDb();
  process.env.CRON_SECRET = "test-secret";
});

afterEach(() => {
  process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
});

describe("GET /api/cron/recategorize-by-age", () => {
  it("rejects a request with no Authorization header", async () => {
    const response = await GET(new Request("http://localhost/api/cron/recategorize-by-age"));
    expect(response.status).toBe(401);
  });

  it("rejects a request with the wrong secret", async () => {
    const response = await GET(
      new Request("http://localhost/api/cron/recategorize-by-age", {
        headers: { authorization: "Bearer wrong-secret" },
      })
    );
    expect(response.status).toBe(401);
  });

  it("rejects every request when CRON_SECRET isn't configured", async () => {
    process.env.CRON_SECRET = "";
    const response = await GET(
      new Request("http://localhost/api/cron/recategorize-by-age", {
        headers: { authorization: "Bearer " },
      })
    );
    expect(response.status).toBe(401);
  });

  it("runs the job and returns the recategorized count with the correct secret", async () => {
    await testDb.insert(role).values({ name: "admin" });

    const response = await GET(
      new Request("http://localhost/api/cron/recategorize-by-age", {
        headers: { authorization: "Bearer test-secret" },
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ recategorized: 0 });
  });
});
