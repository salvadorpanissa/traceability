import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "../../test/db";
import { resetTestDb } from "../../test/reset-db";
import { columnMapping } from "@/db/schema";

beforeEach(async () => {
  await resetTestDb();
});

describe("column_mapping table", () => {
  it("stores a mapping keyed by a unique header signature", async () => {
    const signature = JSON.stringify(["IDE", "Fecha", "SANIDAD"]);
    const mapping = [
      { header: "IDE", meaning: "tag" },
      { header: "Fecha", meaning: "date" },
      { header: "SANIDAD", meaning: "ignore" },
    ];

    const [created] = await testDb.insert(columnMapping).values({ headerSignature: signature, mapping }).returning();
    expect(created.mapping).toEqual(mapping);

    await expect(
      testDb.insert(columnMapping).values({ headerSignature: signature, mapping: [] })
    ).rejects.toThrow();
  });
});
