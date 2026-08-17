import type { ColumnMapping } from "@/lib/activities/column-mapping";
import type { HealthProduct } from "@/lib/activities/health";
import type { ResolvedRow } from "@/lib/activities/batch-resolution";

export type HealthFormStep = "mapping" | "legend" | "eventDate" | "products" | "review";

export type HealthFormDraft = {
  establishmentId: string;
  paddockId: string | null;
  eventDate: string;
  step: HealthFormStep | null;
  stepHistory: HealthFormStep[];
  headers: string[];
  workingMapping: ColumnMapping[] | null;
  distinctValues: string[];
  headerSignature: string;
  reproductiveStatusValueMap: Record<string, string>;
  rows: ResolvedRow[];
  products: HealthProduct[];
  suggestedNames: (string | null)[];
  transferMismatched: boolean | null;
};

const DRAFT_KEY = "health-form-draft";

// sessionStorage can throw (private browsing quota, disabled storage) — a
// failed save/load just means the draft doesn't survive a reload, not a
// crash.
export function saveHealthFormDraft(draft: HealthFormDraft): void {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // ignore
  }
}

export function loadHealthFormDraft(): HealthFormDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as HealthFormDraft) : null;
  } catch {
    return null;
  }
}

export function clearHealthFormDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}
