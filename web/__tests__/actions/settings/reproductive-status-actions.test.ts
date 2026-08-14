import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../../../test/db";
import { resetTestDb } from "../../../test/reset-db";
import { farm, role, userAccount, userFarm } from "@/db/schema";

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/lib/dal/session", () => ({
  requireSession: vi.fn(),
}));

const { requireSession } = await import("@/lib/dal/session");
const { createReproductiveStatusAction, updateReproductiveStatusAction, archiveReproductiveStatusAction } = await import(
  "@/app/(protected)/settings/reproductive-status/actions"
);

beforeEach(async () => {
  await resetTestDb();
});

async function seedManagerWithFarm() {
  const [managerRole] = await testDb.insert(role).values({ name: "manager" }).returning();
  const [group] = await testDb.insert(farm).values({ name: "Grupo" }).returning();
  const [manager] = await testDb
    .insert(userAccount)
    .values({ name: "Manager", email: "manager@example.com", passwordHash: "hashed", roleId: managerRole.id })
    .returning();
  await testDb.insert(userFarm).values({ userId: manager.id, farmId: group.id });
  vi.mocked(requireSession).mockResolvedValue({ user: { id: manager.id, role: "manager" } } as never);
  return { manager, group };
}

describe("createReproductiveStatusAction", () => {
  it("creates a status for a farm the manager has access to", async () => {
    const { group } = await seedManagerWithFarm();

    const result = await createReproductiveStatusAction({ farmId: group.id, name: "Preñada" });

    expect(result).toEqual({ ok: true, entry: { id: expect.any(String), farmId: group.id, name: "Preñada", active: true } });
  });

  it("rejects a duplicate name with a friendly error", async () => {
    const { group } = await seedManagerWithFarm();
    await createReproductiveStatusAction({ farmId: group.id, name: "Preñada" });

    const result = await createReproductiveStatusAction({ farmId: group.id, name: "Preñada" });

    expect(result).toEqual({ ok: false, error: "Ya existe un estado reproductivo con ese nombre" });
  });

  it("rejects a farm the manager has no access to", async () => {
    const { manager } = await seedManagerWithFarm();
    const [otherGroup] = await testDb.insert(farm).values({ name: "Otro grupo" }).returning();
    vi.mocked(requireSession).mockResolvedValue({ user: { id: manager.id, role: "manager" } } as never);

    await expect(createReproductiveStatusAction({ farmId: otherGroup.id, name: "Preñada" })).rejects.toThrow();
  });
});

describe("updateReproductiveStatusAction", () => {
  it("renames a status", async () => {
    const { group } = await seedManagerWithFarm();
    const created = await createReproductiveStatusAction({ farmId: group.id, name: "Preñada" });
    if (!created.ok) throw new Error("setup failed");

    const result = await updateReproductiveStatusAction({ id: created.entry.id, name: "Preñada confirmada" });

    expect(result).toEqual({ ok: true, entry: { ...created.entry, name: "Preñada confirmada" } });
  });
});

describe("archiveReproductiveStatusAction", () => {
  it("archives a status", async () => {
    const { group } = await seedManagerWithFarm();
    const created = await createReproductiveStatusAction({ farmId: group.id, name: "Preñada" });
    if (!created.ok) throw new Error("setup failed");

    const result = await archiveReproductiveStatusAction(created.entry.id);

    expect(result).toEqual({ ok: true, entry: { ...created.entry, active: false } });
  });
});
