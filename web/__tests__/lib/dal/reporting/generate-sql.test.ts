import { afterEach, describe, expect, it, vi } from "vitest";

const generateContentMock = vi.fn(async () => ({ text: "```sql\nSELECT * FROM my_animal_state;\n```" }));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent: generateContentMock },
  })),
}));

const { generateReportingSql } = await import("@/lib/dal/reporting/generate-sql");

afterEach(() => {
  delete process.env.NL_QUERY_TEST_SQL_OVERRIDE;
  delete process.env.GEMINI_API_KEY;
  generateContentMock.mockClear();
});

describe("generateReportingSql", () => {
  it("strips markdown fences and a trailing semicolon from the model output", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const sql = await generateReportingSql("¿cuántos animales hay?");
    expect(sql).toBe("SELECT * FROM my_animal_state");
  });

  it("throws when GEMINI_API_KEY is not set and no test override is present", async () => {
    await expect(generateReportingSql("cualquier cosa")).rejects.toThrow(/GEMINI_API_KEY/);
  });

  it("returns the override verbatim when NL_QUERY_TEST_SQL_OVERRIDE is set, without calling Gemini", async () => {
    process.env.NL_QUERY_TEST_SQL_OVERRIDE = "SELECT 1";
    const sql = await generateReportingSql("cualquier cosa");
    expect(sql).toBe("SELECT 1");
    expect(generateContentMock).not.toHaveBeenCalled();
  });
});
