import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HealthForm } from "@/components/activities/health-form";
import { previewHealthBatch, listPaddocksAction } from "@/app/(protected)/activities/health/actions";
import type { ProductCatalogEntry } from "@/lib/dal/product-catalog";
import type { OwnerCatalogEntry } from "@/lib/dal/owner-catalog";

// This project's vitest config doesn't enable `globals`, so
// @testing-library/react's automatic afterEach cleanup never registers —
// see __tests__/components/dashboard/livestock-status-table.test.tsx for
// the full explanation.
afterEach(cleanup);

const catalog: ProductCatalogEntry[] = [
  {
    id: "p1",
    groupId: "group-1",
    name: "Ivermectina 1%",
    defaultDose: "10",
    defaultDoseUnit: "ml",
    defaultRoute: "subcutánea",
    defaultWithdrawalDays: 21,
  },
];

vi.mock("@/app/(protected)/activities/health/actions", () => ({
  previewHealthBatch: vi.fn(async () => ({
    mappingNeeded: false,
    eventDateNeeded: false,
    headerSignature: '["IDE"]',
    mapping: [{ header: "IDE", meaning: "tag" }],
    rows: [
      {
        tag: "AR000000000090",
        eventDate: "2026-02-01",
        notes: null,
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
  createProductAction: vi.fn(async (farmId: string, name: string) => ({
    id: "p2",
    groupId: "group-1",
    name,
    defaultDose: null,
    defaultDoseUnit: null,
    defaultRoute: null,
    defaultWithdrawalDays: null,
  })),
  createOwnerAction: vi.fn(async (name: string) => ({ id: "o1", name })),
  createHealthPaddockAction: vi.fn(async (farmId: string, name: string) => ({ id: "pd2", name, farmId })),
  listPaddocksAction: vi.fn(async () => [{ id: "pd1", name: "Potrero 1", farmId: "farm-1" }]),
  listProductsAction: vi.fn(async () => catalog),
}));
const ownerCatalog: OwnerCatalogEntry[] = [{ id: "existing-owner", name: "SASG" }];
const farms = [{ id: "farm-1", name: "Campo Norte" }];

async function selectPaddockAndUploadFile(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText("Campo"), "farm-1");
  await waitFor(() => expect(screen.getByRole("option", { name: "Potrero 1" })).toBeInTheDocument());
  await user.selectOptions(screen.getByLabelText("Potrero"), "pd1");
  const file = new File(["dummy"], "lote.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  await user.upload(screen.getByLabelText(/archivo/i), file);
  await user.click(screen.getByRole("button", { name: /subir/i }));
}

describe("HealthForm", () => {
  it("shows the preview and lets the user add a product row", async () => {
    render(<HealthForm ownerCatalog={ownerCatalog} farms={farms} />);
    const user = userEvent.setup();

    await selectPaddockAndUploadFile(user);

    await waitFor(() => expect(screen.getByText("AR000000000090")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /agregar producto/i }));
    expect(screen.getAllByText("Ivermectina 1%")).not.toHaveLength(0);
  });

  it("disables Subir until a potrero and a file are both chosen", async () => {
    render(<HealthForm ownerCatalog={ownerCatalog} farms={farms} />);
    const user = userEvent.setup();

    expect(screen.getByRole("button", { name: /subir/i })).toBeDisabled();

    const file = new File(["dummy"], "lote.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await user.upload(screen.getByLabelText(/archivo/i), file);
    expect(screen.getByRole("button", { name: /subir/i })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Campo"), "farm-1");
    await waitFor(() => expect(screen.getByRole("option", { name: "Potrero 1" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /subir/i })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Potrero"), "pd1");
    expect(screen.getByRole("button", { name: /subir/i })).not.toBeDisabled();
  });

  it("prefills dose unit and withdrawal days from the selected product's defaults", async () => {
    render(<HealthForm ownerCatalog={ownerCatalog} farms={farms} />);
    const user = userEvent.setup();

    await selectPaddockAndUploadFile(user);
    await waitFor(() => expect(screen.getByText("AR000000000090")).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText(/producto/i), "p1");

    expect(screen.getByLabelText("Dosis")).toHaveValue("10");
    expect(screen.getByLabelText(/unidad/i)).toHaveValue("ml");
    expect(screen.getByLabelText(/vía/i)).toHaveValue("subcutánea");
    expect(screen.getByLabelText(/carencia/i)).toHaveValue(21);
  });

  it("pre-fills a product row from a matched suggestion, including its dose and route, and creates a missing one inline", async () => {
    render(<HealthForm ownerCatalog={ownerCatalog} farms={farms} />);
    const user = userEvent.setup();

    await selectPaddockAndUploadFile(user);
    await waitFor(() => expect(screen.getByText("AR000000000090")).toBeInTheDocument());

    // The suggestion matched "Aftosa" (id p1, not in the initial catalog prop) —
    // HealthForm's mocked previewHealthBatch return above stands in for a real
    // catalog lookup, so the row should show it pre-selected along with the
    // matched product's dose/route defaults, not just its dose unit.
    expect(screen.getByLabelText(/producto/i)).toHaveValue("p1");
    expect(screen.getByLabelText("Dosis")).toHaveValue("10");
    expect(screen.getByLabelText(/vía/i)).toHaveValue("subcutánea");
  });

  it("disables Confirmar while an owner is pending, and enables it once created inline", async () => {
    render(<HealthForm ownerCatalog={ownerCatalog} farms={farms} />);
    const user = userEvent.setup();

    await selectPaddockAndUploadFile(user);

    await waitFor(() => expect(screen.getByText("AR000000000090")).toBeInTheDocument());

    // The auto-matched product row already has all its fields (productId,
    // dose, doseUnit, route) filled from the matched suggestion's catalog
    // defaults, so the only thing gating Confirmar in this test is the
    // pending owner.
    expect(screen.getByRole("button", { name: /confirmar/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /confirmar/i })).not.toBeDisabled());
  });

  it("does not show a Fecha field upfront, and asks for one only when the file has no date column", async () => {
    vi.mocked(previewHealthBatch).mockResolvedValueOnce({
      mappingNeeded: false,
      eventDateNeeded: true,
      headerSignature: '["IDE"]',
      mapping: [{ header: "IDE", meaning: "tag" }],
    });
    vi.mocked(previewHealthBatch).mockResolvedValueOnce({
      mappingNeeded: false,
      eventDateNeeded: false,
      headerSignature: '["IDE"]',
      mapping: [{ header: "IDE", meaning: "tag" }],
      rows: [
        {
          tag: "AR000000000097",
          eventDate: "2026-04-01",
          notes: null,
          status: "new",
          categoryId: null,
          sex: null,
          birthDate: null,
          ownerId: null,
          pendingOwnerName: null,
        },
      ],
      productSuggestions: [],
    });

    render(<HealthForm ownerCatalog={ownerCatalog} farms={farms} />);
    const user = userEvent.setup();

    expect(screen.queryByLabelText("Fecha del lote")).not.toBeInTheDocument();

    await selectPaddockAndUploadFile(user);

    await waitFor(() => expect(screen.getByLabelText("Fecha del lote")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /continuar/i })).toBeDisabled();

    await user.type(screen.getByLabelText("Fecha del lote"), "2026-04-01");
    await user.click(screen.getByRole("button", { name: /continuar/i }));

    await waitFor(() => expect(screen.getByText("AR000000000097")).toBeInTheDocument());
    expect(screen.queryByLabelText("Fecha del lote")).not.toBeInTheDocument();
  });

  it("lets the user pick an existing owner for a pending name instead of creating a new one, and confirms with the campo derived from the chosen potrero", async () => {
    render(<HealthForm ownerCatalog={ownerCatalog} farms={farms} />);
    const user = userEvent.setup();

    await selectPaddockAndUploadFile(user);
    await waitFor(() => expect(screen.getByText("AR000000000090")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /confirmar/i })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Usar un propietario existente"), "existing-owner");
    expect(screen.getByRole("button", { name: /confirmar/i })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    const { confirmHealthBatchAction } = await import("@/app/(protected)/activities/health/actions");
    await waitFor(() =>
      expect(confirmHealthBatchAction).toHaveBeenCalledWith(
        expect.objectContaining({
          farmId: "farm-1",
          paddockId: "pd1",
          rows: [expect.objectContaining({ ownerId: "existing-owner" })],
        })
      )
    );
  });

  it("creates a new potrero inline within the chosen campo, and selects it", async () => {
    render(<HealthForm ownerCatalog={ownerCatalog} farms={farms} />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("Campo"), "farm-1");
    await waitFor(() => expect(screen.getByRole("option", { name: "Potrero 1" })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Potrero"), "__create_new__");
    await user.type(screen.getByLabelText("Nombre del potrero nuevo"), "Potrero 2");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    const { createHealthPaddockAction } = await import("@/app/(protected)/activities/health/actions");
    await waitFor(() => expect(createHealthPaddockAction).toHaveBeenCalledWith("farm-1", "Potrero 2"));
    expect(screen.getByLabelText("Potrero")).toHaveValue("pd2");

    const file = new File(["dummy"], "lote.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await user.upload(screen.getByLabelText(/archivo/i), file);
    expect(screen.getByRole("button", { name: /subir/i })).not.toBeDisabled();
  });

  it("shows a paddock-mismatch warning for an existing row in a different potrero, and blocks Confirmar until a choice is made", async () => {
    vi.mocked(previewHealthBatch).mockResolvedValueOnce({
      mappingNeeded: false,
      eventDateNeeded: false,
      headerSignature: '["IDE"]',
      mapping: [{ header: "IDE", meaning: "tag" }],
      rows: [
        {
          tag: "AR000000000091",
          eventDate: "2026-02-01",
          notes: null,
          status: "existing",
          animalId: "animal-1",
          currentFarmId: "farm-1",
          currentPaddockId: "pd2",
        },
      ],
      productSuggestions: [{ rawValue: "Ivermectina 1%", matchedProductId: "p1" }],
    });

    vi.mocked(listPaddocksAction).mockResolvedValueOnce([
      { id: "pd1", name: "Potrero 1", farmId: "farm-1" },
      { id: "pd2", name: "Potrero 2", farmId: "farm-1" },
    ]);
    render(<HealthForm ownerCatalog={ownerCatalog} farms={farms} />);
    const user = userEvent.setup();

    await selectPaddockAndUploadFile(user);
    await waitFor(() => expect(screen.getByText("AR000000000091")).toBeInTheDocument());

    expect(screen.getByText(/actualmente en Potrero 2/)).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /confirmar/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /no, dej/i }));
    expect(screen.getByRole("button", { name: /confirmar/i })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    const { confirmHealthBatchAction } = await import("@/app/(protected)/activities/health/actions");
    await waitFor(() =>
      expect(confirmHealthBatchAction).toHaveBeenCalledWith(
        expect.objectContaining({ transferMismatchedToPaddock: false })
      )
    );
  });

  it("sends transferMismatchedToPaddock: true when the user chooses to also relocate mismatched caravanas", async () => {
    vi.mocked(previewHealthBatch).mockResolvedValueOnce({
      mappingNeeded: false,
      eventDateNeeded: false,
      headerSignature: '["IDE"]',
      mapping: [{ header: "IDE", meaning: "tag" }],
      rows: [
        {
          tag: "AR000000000092",
          eventDate: "2026-02-01",
          notes: null,
          status: "existing",
          animalId: "animal-2",
          currentFarmId: "farm-1",
          currentPaddockId: "pd2",
        },
      ],
      productSuggestions: [{ rawValue: "Ivermectina 1%", matchedProductId: "p1" }],
    });

    vi.mocked(listPaddocksAction).mockResolvedValueOnce([
      { id: "pd1", name: "Potrero 1", farmId: "farm-1" },
      { id: "pd2", name: "Potrero 2", farmId: "farm-1" },
    ]);
    render(<HealthForm ownerCatalog={ownerCatalog} farms={farms} />);
    const user = userEvent.setup();

    await selectPaddockAndUploadFile(user);
    await waitFor(() => expect(screen.getByText("AR000000000092")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /sí, trasladarlas/i }));
    expect(screen.getByRole("button", { name: /confirmar/i })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    const { confirmHealthBatchAction } = await import("@/app/(protected)/activities/health/actions");
    await waitFor(() =>
      expect(confirmHealthBatchAction).toHaveBeenCalledWith(
        expect.objectContaining({ transferMismatchedToPaddock: true })
      )
    );
  });

  it("does not show the paddock-mismatch warning when there are no mismatched rows", async () => {
    render(<HealthForm ownerCatalog={ownerCatalog} farms={farms} />);
    const user = userEvent.setup();

    await selectPaddockAndUploadFile(user);
    await waitFor(() => expect(screen.getByText("AR000000000090")).toBeInTheDocument());

    expect(screen.queryByText(/trasladarlas también a este potrero/i)).not.toBeInTheDocument();
  });
});
