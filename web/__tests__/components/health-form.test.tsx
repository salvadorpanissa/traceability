import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HealthForm } from "@/components/activities/health-form";
import type { ProductCatalogEntry } from "@/lib/dal/product-catalog";

// This project's vitest config doesn't enable `globals`, so
// @testing-library/react's automatic afterEach cleanup never registers —
// see __tests__/components/dashboard/livestock-status-table.test.tsx for
// the full explanation.
afterEach(cleanup);

vi.mock("@/app/(protected)/activities/health/actions", () => ({
  previewHealthBatch: vi.fn(async () => ({
    mappingNeeded: false,
    headerSignature: '["IDE"]',
    mapping: [{ header: "IDE", meaning: "tag" }],
    rows: [
      {
        tag: "AR000000000090",
        eventDate: "2026-02-01",
        status: "new",
        categoryId: null,
        sex: null,
        ownerId: null,
        pendingOwnerName: "Gómez",
      },
    ],
    productSuggestions: [{ rawValue: "Aftosa", matchedProductId: "p1" }],
  })),
  confirmHealthBatchAction: vi.fn(async () => undefined),
  createProductAction: vi.fn(async (name: string) => ({
    id: "p2",
    name,
    defaultDoseUnit: null,
    defaultWithdrawalDays: null,
  })),
  createOwnerAction: vi.fn(async (name: string) => ({ id: "o1", name })),
}));

const catalog: ProductCatalogEntry[] = [
  { id: "p1", name: "Ivermectina 1%", defaultDoseUnit: "ml", defaultWithdrawalDays: 21 },
];

describe("HealthForm", () => {
  it("shows the preview and lets the user add a product row", async () => {
    render(<HealthForm catalog={catalog} />);
    const user = userEvent.setup();

    const file = new File(["dummy"], "lote.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await user.upload(screen.getByLabelText(/archivo/i), file);
    await user.click(screen.getByRole("button", { name: /subir/i }));

    await waitFor(() => expect(screen.getByText("AR000000000090")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /agregar producto/i }));
    expect(screen.getAllByText("Ivermectina 1%")).not.toHaveLength(0);
  });

  it("prefills dose unit and withdrawal days from the selected product's defaults", async () => {
    render(<HealthForm catalog={catalog} />);
    const user = userEvent.setup();

    const file = new File(["dummy"], "lote.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    await user.upload(screen.getByLabelText(/archivo/i), file);
    await user.click(screen.getByRole("button", { name: /subir/i }));
    await waitFor(() => expect(screen.getByText("AR000000000090")).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText(/producto/i), "p1");

    expect(screen.getByLabelText(/unidad/i)).toHaveValue("ml");
    expect(screen.getByLabelText(/carencia/i)).toHaveValue(21);
  });

  it("pre-fills a product row from a matched suggestion, and creates a missing one inline", async () => {
    render(<HealthForm catalog={catalog} />);
    const user = userEvent.setup();

    const file = new File(["dummy"], "lote.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    await user.upload(screen.getByLabelText(/archivo/i), file);
    await user.click(screen.getByRole("button", { name: /subir/i }));
    await waitFor(() => expect(screen.getByText("AR000000000090")).toBeInTheDocument());

    // The suggestion matched "Aftosa" (id p1, not in the initial catalog prop) —
    // HealthForm's mocked previewHealthBatch return above stands in for a real
    // catalog lookup, so the row should show it pre-selected.
    expect(screen.getByLabelText(/producto/i)).toHaveValue("p1");
  });

  it("disables Confirmar while an owner is pending, and enables it once created inline", async () => {
    render(<HealthForm catalog={catalog} />);
    const user = userEvent.setup();

    const file = new File(["dummy"], "lote.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await user.upload(screen.getByLabelText(/archivo/i), file);
    await user.click(screen.getByRole("button", { name: /subir/i }));

    await waitFor(() => expect(screen.getByText("AR000000000090")).toBeInTheDocument());

    // Fill in the rest of the (auto-matched) product row so the only thing
    // gating Confirmar in this test is the pending owner, not an incomplete
    // product — the row already has productId "p1" and doseUnit "ml" from
    // the matched suggestion's defaults, but dose/route still need values.
    await user.type(screen.getByLabelText("Dosis"), "10");
    await user.type(screen.getByLabelText(/vía/i), "subcutánea");

    expect(screen.getByRole("button", { name: /confirmar/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /confirmar/i })).not.toBeDisabled());
  });
});
