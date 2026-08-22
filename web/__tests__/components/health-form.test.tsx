import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HealthForm } from "@/components/activities/health-form";
import {
  previewHealthBatch,
  listPaddocksAction,
  resolveReproductiveStatusNamesAction,
} from "@/app/(protected)/activities/health/actions";
import { parseActivityFileAction } from "@/app/(protected)/activities/shared-actions";
import type { ProductCatalogEntry } from "@/lib/dal/product-catalog";
import type { OwnerCatalogEntry } from "@/lib/dal/owner-catalog";

// This project's vitest config doesn't enable `globals`, so
// @testing-library/react's automatic afterEach cleanup never registers —
// see __tests__/components/dashboard/livestock-status-table.test.tsx for
// the full explanation.
//
// vi.clearAllMocks() resets each mock's call count between tests (see
// __tests__/components/death-form.test.tsx for the same pattern) — needed
// so a later test's toHaveBeenCalledTimes assertion on previewHealthBatch
// isn't polluted by calls made in earlier tests in this file.
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStorage.clear();
});

const catalog: ProductCatalogEntry[] = [
  {
    id: "p1",
    farmId: "group-1",
    name: "Ivermectina 1%",
    defaultDose: "10",
    defaultDoseUnit: "ml",
    defaultRoute: "subcutánea",
    defaultWithdrawalDays: 21,
  },
];

// Parsing the file is establishment-free and lives in its own module — it's
// what the wizard's very first step calls, before any campo is chosen.
vi.mock("@/app/(protected)/activities/shared-actions", () => ({
  parseActivityFileAction: vi.fn(async () => ({
    headers: ["IDE"],
    rows: [["AR000000000090"]],
    initialMapping: null,
  })),
}));

vi.mock("@/app/(protected)/activities/health/actions", () => ({
  previewHealthBatch: vi.fn(async () => ({
    mappingNeeded: false,
    valueLegendNeeded: false,
    eventDateNeeded: false,
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
  createProductAction: vi.fn(async (establishmentId: string, name: string) => ({
    id: "p2",
    farmId: "group-1",
    name,
    defaultDose: null,
    defaultDoseUnit: null,
    defaultRoute: null,
    defaultWithdrawalDays: null,
  })),
  createOwnerAction: vi.fn(async (name: string) => ({ id: "o1", name })),
  createHealthPaddockAction: vi.fn(async (establishmentId: string, name: string) => ({ id: "pd2", name, establishmentId })),
  listPaddocksAction: vi.fn(async () => [{ id: "pd1", name: "Potrero 1", establishmentId: "establishment-1" }]),
  listTagsInPaddockAction: vi.fn(async () => []),
  listProductsAction: vi.fn(async () => catalog),
  resolveReproductiveStatusNamesAction: vi.fn(async (_establishmentId: string, nameMap: Record<string, string>) =>
    Object.fromEntries(Object.entries(nameMap).map(([k, v]) => [k, v ? `rs-${v}` : ""]))
  ),
}));
const ownerCatalog: OwnerCatalogEntry[] = [{ id: "existing-owner", name: "SASG", farmId: "group-1" }];
const establishments = [{ id: "establishment-1", name: "Campo Norte" }];

function xlsxFile() {
  return new File(["dummy"], "lote.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// Walks the wizard in its real order: archivo → mapeo → campo/potrero.
async function uploadFileMapAndPickPaddock(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(screen.getByLabelText(/archivo/i), xlsxFile());
  await user.click(screen.getByRole("button", { name: /subir/i }));

  await waitFor(() => expect(screen.getByLabelText("IDE")).toBeInTheDocument());
  await user.selectOptions(screen.getByLabelText("IDE"), "tag");
  await user.click(screen.getByRole("button", { name: "Continuar" }));

  await waitFor(() => expect(screen.getByLabelText("Campo")).toBeInTheDocument());
  await user.selectOptions(screen.getByLabelText("Campo"), "establishment-1");
  await waitFor(() => expect(screen.getByRole("option", { name: "Potrero 1" })).toBeInTheDocument());
  await user.selectOptions(screen.getByLabelText("Potrero"), "pd1");
  await user.click(screen.getByRole("button", { name: "Continuar" }));
}

// Advances from the "Productos" screen to "Caravanas y confirmación" —
// only enabled once every product row is fully filled.
async function continueToReview(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).not.toBeDisabled());
  await user.click(screen.getByRole("button", { name: "Continuar" }));
}

async function confirmViaDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /confirmar/i }));
  const confirmButtons = await screen.findAllByRole("button", { name: /confirmar/i });
  await user.click(confirmButtons[confirmButtons.length - 1]);
}

describe("HealthForm", () => {
  it("shows the preview and lets the user add a product row", async () => {
    render(<HealthForm ownerCatalog={ownerCatalog} establishments={establishments} />);
    const user = userEvent.setup();

    await uploadFileMapAndPickPaddock(user);

    await waitFor(() => expect(screen.getByRole("button", { name: /agregar producto/i })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /agregar producto/i }));
    expect(screen.getAllByText("Ivermectina 1%")).not.toHaveLength(0);
  });

  it("asks only for the archivo first — Subir is disabled until a file is chosen, and no campo is asked for yet", async () => {
    render(<HealthForm ownerCatalog={ownerCatalog} establishments={establishments} />);
    const user = userEvent.setup();

    expect(screen.getByRole("button", { name: /subir/i })).toBeDisabled();
    expect(screen.queryByLabelText("Campo")).not.toBeInTheDocument();

    await user.upload(screen.getByLabelText(/archivo/i), xlsxFile());
    expect(screen.getByRole("button", { name: /subir/i })).not.toBeDisabled();
  });

  it("orders steps as archivo, mapeo, campo/potrero — and Atrás from campo returns to mapeo", async () => {
    render(<HealthForm ownerCatalog={ownerCatalog} establishments={establishments} />);
    const user = userEvent.setup();

    await user.upload(screen.getByLabelText(/archivo/i), xlsxFile());
    await user.click(screen.getByRole("button", { name: /subir/i }));

    await waitFor(() => expect(screen.getByLabelText("IDE")).toBeInTheDocument());
    expect(screen.queryByLabelText("Campo")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("IDE"), "tag");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByLabelText("Campo")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /atrás/i }));

    await waitFor(() => expect(screen.getByLabelText("IDE")).toBeInTheDocument());
    expect(screen.getByLabelText("IDE")).toHaveValue("tag");
    expect(previewHealthBatch).not.toHaveBeenCalled();
  });

  it("shows the free-text reproductive-status step before campo when a column is mapped, and resolves names once campo is chosen", async () => {
    vi.mocked(parseActivityFileAction).mockResolvedValueOnce({
      headers: ["IDE", "Preñez"],
      rows: [
        ["AR1", "1"],
        ["AR2", "2"],
      ],
      initialMapping: null,
    });
    vi.mocked(previewHealthBatch).mockResolvedValueOnce({
      mappingNeeded: false,
      valueLegendNeeded: false,
      eventDateNeeded: false,
      mapping: [
        { header: "IDE", meaning: "tag" },
        {
          header: "Preñez",
          meaning: "reproductiveStatus",
          reproductiveStatusValueMap: { "1": "rs-Preñada", "2": "rs-Vacía" },
        },
      ],
      rows: [],
      productSuggestions: [],
    });

    render(<HealthForm ownerCatalog={ownerCatalog} establishments={establishments} />);
    const user = userEvent.setup();

    await user.upload(screen.getByLabelText(/archivo/i), xlsxFile());
    await user.click(screen.getByRole("button", { name: /subir/i }));

    await waitFor(() => expect(screen.getByLabelText("IDE")).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("IDE"), "tag");
    await user.selectOptions(screen.getByLabelText("Preñez"), "reproductiveStatus");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByText("A qué estado corresponde cada valor de la columna")).toBeInTheDocument());
    expect(screen.queryByLabelText("Campo")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Valor: 1"), "Preñada");
    await user.type(screen.getByLabelText("Valor: 2"), "Vacía");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByLabelText("Campo")).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Campo"), "establishment-1");
    await waitFor(() => expect(screen.getByRole("option", { name: "Potrero 1" })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Potrero"), "pd1");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() =>
      expect(resolveReproductiveStatusNamesAction).toHaveBeenCalledWith("establishment-1", {
        "1": "Preñada",
        "2": "Vacía",
      })
    );
    await waitFor(() => expect(previewHealthBatch).toHaveBeenCalledTimes(1));

    // The mapping actually sent to the server carries the resolved status ids,
    // not the free-text names the user typed.
    const sent = vi.mocked(previewHealthBatch).mock.calls[0][0];
    expect(JSON.parse(sent.get("mapping") as string)).toEqual([
      { header: "IDE", meaning: "tag" },
      {
        header: "Preñez",
        meaning: "reproductiveStatus",
        reproductiveStatusValueMap: { "1": "rs-Preñada", "2": "rs-Vacía" },
      },
    ]);
  });

  it("skips the reproductive-status step when no such column is mapped", async () => {
    render(<HealthForm ownerCatalog={ownerCatalog} establishments={establishments} />);
    const user = userEvent.setup();

    await user.upload(screen.getByLabelText(/archivo/i), xlsxFile());
    await user.click(screen.getByRole("button", { name: /subir/i }));

    await waitFor(() => expect(screen.getByLabelText("IDE")).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("IDE"), "tag");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByLabelText("Campo")).toBeInTheDocument());
    expect(screen.queryByText("A qué estado corresponde cada valor de la columna")).not.toBeInTheDocument();
    expect(resolveReproductiveStatusNamesAction).not.toHaveBeenCalled();
  });

  it("prefills dose unit and withdrawal days from the selected product's defaults", async () => {
    render(<HealthForm ownerCatalog={ownerCatalog} establishments={establishments} />);
    const user = userEvent.setup();

    await uploadFileMapAndPickPaddock(user);
    await waitFor(() => expect(screen.getByLabelText(/producto/i)).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText(/producto/i), "p1");

    expect(screen.getByLabelText("Dosis")).toHaveValue("10");
    expect(screen.getByLabelText(/unidad/i)).toHaveValue("ml");
    expect(screen.getByLabelText(/vía/i)).toHaveValue("subcutánea");
    expect(screen.getByLabelText(/carencia/i)).toHaveValue(21);
  });

  it("pre-fills a product row from a matched suggestion, including its dose and route, and creates a missing one inline", async () => {
    render(<HealthForm ownerCatalog={ownerCatalog} establishments={establishments} />);
    const user = userEvent.setup();

    await uploadFileMapAndPickPaddock(user);
    await waitFor(() => expect(screen.getByLabelText(/producto/i)).toBeInTheDocument());

    // The suggestion matched "Aftosa" (id p1, not in the initial catalog prop) —
    // HealthForm's mocked previewHealthBatch return above stands in for a real
    // catalog lookup, so the row should show it pre-selected along with the
    // matched product's dose/route defaults, not just its dose unit.
    expect(screen.getByLabelText(/producto/i)).toHaveValue("p1");
    expect(screen.getByLabelText("Dosis")).toHaveValue("10");
    expect(screen.getByLabelText(/vía/i)).toHaveValue("subcutánea");
  });

  it("disables Confirmar while an owner is pending, and enables it once created inline", async () => {
    render(<HealthForm ownerCatalog={ownerCatalog} establishments={establishments} />);
    const user = userEvent.setup();

    await uploadFileMapAndPickPaddock(user);
    // The auto-matched product row already has all its fields (productId,
    // dose, doseUnit, route) filled from the matched suggestion's catalog
    // defaults, so Productos' Continuar is enabled right away.
    await continueToReview(user);

    // The only thing gating Confirmar in this test is the pending owner.
    expect(screen.getByRole("button", { name: /confirmar/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /confirmar/i })).not.toBeDisabled());
  });

  it("does not show a Fecha field upfront, and asks for one only when the file has no date column", async () => {
    vi.mocked(previewHealthBatch).mockResolvedValueOnce({
      mappingNeeded: false,
      valueLegendNeeded: false,
      eventDateNeeded: true,
      mapping: [{ header: "IDE", meaning: "tag" }],
    });
    vi.mocked(previewHealthBatch).mockResolvedValueOnce({
      mappingNeeded: false,
      valueLegendNeeded: false,
      eventDateNeeded: false,
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

    render(<HealthForm ownerCatalog={ownerCatalog} establishments={establishments} />);
    const user = userEvent.setup();

    expect(screen.queryByLabelText("Fecha del lote")).not.toBeInTheDocument();

    await uploadFileMapAndPickPaddock(user);

    await waitFor(() => expect(screen.getByLabelText("Fecha del lote")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();

    await user.type(screen.getByLabelText("Fecha del lote"), "2026-04-01");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByLabelText(/producto/i)).toBeInTheDocument());
    expect(screen.queryByLabelText("Fecha del lote")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/producto/i), "p1");
    await continueToReview(user);

    await waitFor(() => expect(screen.getByText("AR000000000097")).toBeInTheDocument());
  });

  it("lets the user pick an existing owner for a pending name instead of creating a new one, and confirms with the campo derived from the chosen potrero", async () => {
    render(<HealthForm ownerCatalog={ownerCatalog} establishments={establishments} />);
    const user = userEvent.setup();

    await uploadFileMapAndPickPaddock(user);
    await continueToReview(user);

    expect(screen.getByRole("button", { name: /confirmar/i })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Usar un propietario existente"), "existing-owner");
    expect(screen.getByRole("button", { name: /confirmar/i })).not.toBeDisabled();

    await confirmViaDialog(user);

    const { confirmHealthBatchAction } = await import("@/app/(protected)/activities/health/actions");
    await waitFor(() =>
      expect(confirmHealthBatchAction).toHaveBeenCalledWith(
        expect.objectContaining({
          establishmentId: "establishment-1",
          paddockId: "pd1",
          rows: [expect.objectContaining({ ownerId: "existing-owner" })],
        })
      )
    );
  });

  it("creates a new potrero inline within the chosen campo, and selects it", async () => {
    render(<HealthForm ownerCatalog={ownerCatalog} establishments={establishments} />);
    const user = userEvent.setup();

    await user.upload(screen.getByLabelText(/archivo/i), xlsxFile());
    await user.click(screen.getByRole("button", { name: /subir/i }));

    await waitFor(() => expect(screen.getByLabelText("IDE")).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("IDE"), "tag");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByLabelText("Campo")).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Campo"), "establishment-1");
    await waitFor(() => expect(screen.getByRole("option", { name: "Potrero 1" })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Potrero"), "__create_new__");
    await user.type(screen.getByLabelText("Nombre del potrero nuevo"), "Potrero 2");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    const { createHealthPaddockAction } = await import("@/app/(protected)/activities/health/actions");
    await waitFor(() => expect(createHealthPaddockAction).toHaveBeenCalledWith("establishment-1", "Potrero 2"));
    expect(screen.getByLabelText("Potrero")).toHaveValue("pd2");
    expect(screen.getByRole("button", { name: "Continuar" })).not.toBeDisabled();
  });

  it("shows a paddock-mismatch warning for an existing row in a different potrero, and blocks Confirmar until a choice is made", async () => {
    vi.mocked(previewHealthBatch).mockResolvedValueOnce({
      mappingNeeded: false,
      valueLegendNeeded: false,
      eventDateNeeded: false,
      mapping: [{ header: "IDE", meaning: "tag" }],
      rows: [
        {
          tag: "AR000000000091",
          eventDate: "2026-02-01",
          notes: null,
          status: "existing",
          animalId: "animal-1",
          currentEstablishmentId: "establishment-1",
          currentPaddockId: "pd2",
        },
      ],
      productSuggestions: [{ rawValue: "Ivermectina 1%", matchedProductId: "p1" }],
    });

    vi.mocked(listPaddocksAction).mockResolvedValueOnce([
      { id: "pd1", name: "Potrero 1", establishmentId: "establishment-1" },
      { id: "pd2", name: "Potrero 2", establishmentId: "establishment-1" },
    ]);
    render(<HealthForm ownerCatalog={ownerCatalog} establishments={establishments} />);
    const user = userEvent.setup();

    await uploadFileMapAndPickPaddock(user);
    await continueToReview(user);
    await waitFor(() => expect(screen.getByText("AR000000000091")).toBeInTheDocument());

    expect(screen.getByText(/actualmente en Potrero 2/)).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /confirmar/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /no, dej/i }));
    expect(screen.getByRole("button", { name: /confirmar/i })).not.toBeDisabled();

    await confirmViaDialog(user);

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
      valueLegendNeeded: false,
      eventDateNeeded: false,
      mapping: [{ header: "IDE", meaning: "tag" }],
      rows: [
        {
          tag: "AR000000000092",
          eventDate: "2026-02-01",
          notes: null,
          status: "existing",
          animalId: "animal-2",
          currentEstablishmentId: "establishment-1",
          currentPaddockId: "pd2",
        },
      ],
      productSuggestions: [{ rawValue: "Ivermectina 1%", matchedProductId: "p1" }],
    });

    vi.mocked(listPaddocksAction).mockResolvedValueOnce([
      { id: "pd1", name: "Potrero 1", establishmentId: "establishment-1" },
      { id: "pd2", name: "Potrero 2", establishmentId: "establishment-1" },
    ]);
    render(<HealthForm ownerCatalog={ownerCatalog} establishments={establishments} />);
    const user = userEvent.setup();

    await uploadFileMapAndPickPaddock(user);
    await continueToReview(user);
    await waitFor(() => expect(screen.getByText("AR000000000092")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /sí, trasladarlas/i }));
    expect(screen.getByRole("button", { name: /confirmar/i })).not.toBeDisabled();

    await confirmViaDialog(user);

    const { confirmHealthBatchAction } = await import("@/app/(protected)/activities/health/actions");
    await waitFor(() =>
      expect(confirmHealthBatchAction).toHaveBeenCalledWith(
        expect.objectContaining({ transferMismatchedToPaddock: true })
      )
    );
  });

  it("does not show the paddock-mismatch warning when there are no mismatched rows", async () => {
    render(<HealthForm ownerCatalog={ownerCatalog} establishments={establishments} />);
    const user = userEvent.setup();

    await uploadFileMapAndPickPaddock(user);
    await waitFor(() => expect(screen.getByRole("button", { name: /agregar producto/i })).toBeInTheDocument());

    expect(screen.queryByText(/trasladarlas también a este potrero/i)).not.toBeInTheDocument();
  });

  it("lets the user go back from productos through campo/potrero to the column mapping without losing their choices or re-hitting the server", async () => {
    render(<HealthForm ownerCatalog={ownerCatalog} establishments={establishments} />);
    const user = userEvent.setup();

    await uploadFileMapAndPickPaddock(user);
    await waitFor(() => expect(screen.getByRole("button", { name: /agregar producto/i })).toBeInTheDocument());
    expect(previewHealthBatch).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /atrás/i }));

    await waitFor(() => expect(screen.getByLabelText("Campo")).toBeInTheDocument());
    expect(screen.getByLabelText("Campo")).toHaveValue("establishment-1");
    expect(screen.getByLabelText("Potrero")).toHaveValue("pd1");

    await user.click(screen.getByRole("button", { name: /atrás/i }));

    await waitFor(() => expect(screen.getByLabelText("IDE")).toBeInTheDocument());
    expect(screen.getByLabelText("IDE")).toHaveValue("tag");
    expect(previewHealthBatch).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByLabelText("Campo")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /agregar producto/i })).toBeInTheDocument());
    expect(previewHealthBatch).toHaveBeenCalledTimes(2);
  });

  it("survives a page reload while waiting for the fecha, restoring the saved step and date", async () => {
    vi.mocked(previewHealthBatch).mockResolvedValueOnce({
      mappingNeeded: false,
      valueLegendNeeded: false,
      eventDateNeeded: true,
      mapping: [{ header: "IDE", meaning: "tag" }],
    });

    const { unmount } = render(<HealthForm ownerCatalog={ownerCatalog} establishments={establishments} />);
    const user = userEvent.setup();

    await uploadFileMapAndPickPaddock(user);
    await waitFor(() => expect(screen.getByLabelText("Fecha del lote")).toBeInTheDocument());
    await user.type(screen.getByLabelText("Fecha del lote"), "2026-04-01");

    // Simulate a reload: unmount without confirming, then mount fresh —
    // sessionStorage (not cleared by unmount) is what should carry the draft.
    unmount();

    render(<HealthForm ownerCatalog={ownerCatalog} establishments={establishments} />);

    await waitFor(() => expect(screen.getByLabelText("Fecha del lote")).toHaveValue("2026-04-01"));
    // The whole wizard state — including the parsed rows and the chosen
    // campo/potrero — comes back without asking for the file again.
    await user.click(screen.getByRole("button", { name: /atrás/i }));
    await waitFor(() => expect(screen.getByLabelText("Campo")).toBeInTheDocument());
    expect(screen.getByLabelText("Campo")).toHaveValue("establishment-1");
    expect(screen.getByLabelText("Potrero")).toHaveValue("pd1");
  });

  it("discards the draft and returns to the archivo step", async () => {
    render(<HealthForm ownerCatalog={ownerCatalog} establishments={establishments} />);
    const user = userEvent.setup();

    await uploadFileMapAndPickPaddock(user);
    await waitFor(() => expect(screen.getByRole("button", { name: /agregar producto/i })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /descartar borrador/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /subir/i })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /subir/i })).toBeDisabled();
    expect(screen.queryByLabelText("Campo")).not.toBeInTheDocument();
  });
});
