import { describe, expect, it, beforeEach } from "vitest";
import { saveHealthFormDraft, loadHealthFormDraft, clearHealthFormDraft, type HealthFormDraft } from "@/lib/activities/health-form-draft";

const draft: HealthFormDraft = {
  establishmentId: "est-1",
  paddockId: "paddock-1",
  eventDate: "2026-08-17",
  step: "review",
  stepHistory: ["mapping", "reproductiveStatus", "establishment", "eventDate"],
  headers: ["Caravana", "Fecha"],
  rawRows: [["AR1", "2026-02-01", "1"]],
  workingMapping: [{ header: "Caravana", meaning: "tag" }],
  reproductiveStatusNameMap: { "1": "Preñada" },
  rows: [],
  products: [],
  suggestedNames: [],
  transferMismatched: true,
};

describe("health-form-draft", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("returns null when nothing was saved", () => {
    expect(loadHealthFormDraft()).toBeNull();
  });

  it("round-trips a saved draft", () => {
    saveHealthFormDraft(draft);
    expect(loadHealthFormDraft()).toEqual(draft);
    expect(loadHealthFormDraft()?.rawRows).toEqual([["AR1", "2026-02-01", "1"]]);
    expect(loadHealthFormDraft()?.reproductiveStatusNameMap).toEqual({ "1": "Preñada" });
  });

  it("clears the draft", () => {
    saveHealthFormDraft(draft);
    clearHealthFormDraft();
    expect(loadHealthFormDraft()).toBeNull();
  });

  it("returns null instead of throwing on corrupted storage", () => {
    sessionStorage.setItem("health-form-draft", "{not json");
    expect(loadHealthFormDraft()).toBeNull();
  });
});
