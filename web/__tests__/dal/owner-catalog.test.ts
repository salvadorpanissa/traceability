import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { owner } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));

const { listOwners, createOwner } = await import("@/lib/dal/owner-catalog");

beforeEach(async () => {
  await resetTestDb();
});

describe("listOwners", () => {
  it("lists every owner ordered by name", async () => {
    await testDb.insert(owner).values([{ name: "Pérez" }, { name: "Gómez" }]);

    const owners = await listOwners();

    expect(owners).toEqual([
      { id: expect.any(String), name: "Gómez" },
      { id: expect.any(String), name: "Pérez" },
    ]);
  });
});

describe("createOwner", () => {
  it("creates an owner with the given name", async () => {
    const created = await createOwner("Pérez");

    expect(created.name).toBe("Pérez");

    const [stored] = await testDb.select().from(owner).where(eq(owner.id, created.id));
    expect(stored.name).toBe("Pérez");
  });

  it("rejects a duplicate name", async () => {
    await createOwner("Pérez");
    await expect(createOwner("Pérez")).rejects.toThrow();
  });
});
