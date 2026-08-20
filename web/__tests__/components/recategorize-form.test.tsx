import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecategorizeForm } from "@/components/activities/recategorize-form";
import {
  previewRecategorizeBatch,
  confirmRecategorizeBatchAction,
  listCategoriesAction,
} from "@/app/(protected)/activities/recategorize/actions";

afterEach(cleanup);

vi.mock("@/app/(protected)/activities/recategorize/actions", () => ({
  previewRecategorizeBatch: vi.fn(),
  confirmRecategorizeBatchAction: vi.fn(),
  listCategoriesAction: vi.fn(),
}));

const farms = [{ id: "farm-1", name: "Campo Norte" }];

function sampleFile(): File {
  return new File(["Caravana,Fecha\nAR1,2026-03-01"], "lote.csv", { type: "text/csv" });
}

async function pickFarm() {
  await waitFor(() => expect(screen.getByLabelText("Archivo")).not.toBeDisabled());
}

async function confirmViaDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Confirmar" }));
  const confirmButtons = await screen.findAllByRole("button", { name: "Confirmar" });
  await user.click(confirmButtons[confirmButtons.length - 1]);
}

describe("RecategorizeForm", () => {
  it("asks for a campo, loads that campo's categories, previews resolved rows, and confirms per-sex targets", async () => {
    vi.mocked(listCategoriesAction).mockResolvedValue([
      { id: "cat-novillo", farmId: "group-1", name: "Novillo", sex: null, minAgeMonths: null, active: true },
      {
        id: "cat-novillo-plus3",
        farmId: "group-1",
        name: "Novillo +3 años",
        sex: "male",
        minAgeMonths: 36,
        active: true,
      },
      { id: "cat-vaquillona", farmId: "group-1", name: "Vaquillona", sex: "female", minAgeMonths: null, active: true },
    ]);
    vi.mocked(previewRecategorizeBatch).mockResolvedValue({
      mappingNeeded: false,
      eventDateNeeded: false,
      mapping: [],
      rows: [
        {
          tag: "AR1",
          eventDate: "2026-03-01",
          notes: null,
          status: "existing",
          animalId: "animal-1",
          currentEstablishmentId: "establishment-1",
          currentCategoryId: "cat-novillo",
          currentCategoryName: "Novillo",
          sex: "male",
        },
      ],
    });
    vi.mocked(confirmRecategorizeBatchAction).mockResolvedValue(undefined);

    render(<RecategorizeForm farms={farms} />);

    const user = userEvent.setup();
    await pickFarm();

    await user.upload(screen.getByLabelText("Archivo"), sampleFile());
    await user.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => expect(screen.getByText("AR1")).toBeInTheDocument());
    const table = screen.getByRole("table");
    expect(within(table).getByText("Novillo")).toBeInTheDocument();

    // Both selectors offer sex-agnostic categories; only "machos" also offers the male-only one.
    expect(within(screen.getByLabelText("Categoría destino (machos)")).getByText("Novillo +3 años")).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Categoría destino (hembras)")).queryByText("Novillo +3 años")
    ).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Categoría destino (machos)"), "cat-novillo-plus3");
    expect(within(table).getByText("Novillo +3 años")).toBeInTheDocument();

    await confirmViaDialog(user);

    await waitFor(() =>
      expect(confirmRecategorizeBatchAction).toHaveBeenCalledWith({
        mapping: [],
        farmId: "farm-1",
        targetCategoryIdBySex: { male: "cat-novillo-plus3", female: null },
        rows: expect.any(Array),
        unresolvableDecisions: {},
      })
    );
    expect(screen.getByText("Lote confirmado.")).toBeInTheDocument();
  });

  it("stays on the review step and allows retrying when confirming fails", async () => {
    vi.mocked(listCategoriesAction).mockResolvedValue([
      {
        id: "cat-novillo-plus3",
        farmId: "group-1",
        name: "Novillo +3 años",
        sex: "male",
        minAgeMonths: 36,
        active: true,
      },
    ]);
    vi.mocked(previewRecategorizeBatch).mockResolvedValue({
      mappingNeeded: false,
      eventDateNeeded: false,
      mapping: [],
      rows: [
        {
          tag: "AR1",
          eventDate: "2026-03-01",
          notes: null,
          status: "existing",
          animalId: "animal-1",
          currentEstablishmentId: "establishment-1",
          currentCategoryId: "cat-novillo",
          currentCategoryName: "Novillo",
          sex: "male",
        },
      ],
    });
    vi.mocked(confirmRecategorizeBatchAction).mockRejectedValue(
      new Error("El lote cambió desde que se generó la vista previa; volvé a subir el archivo.")
    );

    render(<RecategorizeForm farms={farms} />);

    const user = userEvent.setup();
    await pickFarm();
    await user.upload(screen.getByLabelText("Archivo"), sampleFile());
    await user.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => expect(screen.getByText("AR1")).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Categoría destino (machos)"), "cat-novillo-plus3");
    await confirmViaDialog(user);

    await waitFor(() => expect(confirmRecategorizeBatchAction).toHaveBeenCalled());
    // Still on the preview step, not the success state, and still retryable.
    expect(screen.queryByText("Lote confirmado.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar" })).not.toBeDisabled();

    // A second attempt succeeds.
    vi.mocked(confirmRecategorizeBatchAction).mockResolvedValue(undefined);
    await confirmViaDialog(user);
    await waitFor(() => expect(screen.getByText("Lote confirmado.")).toBeInTheDocument());
  });

  it("disables Confirmar when a row has an error", async () => {
    vi.mocked(listCategoriesAction).mockResolvedValue([
      { id: "cat-novillo", farmId: "group-1", name: "Novillo", sex: "male", minAgeMonths: null, active: true },
    ]);
    vi.mocked(previewRecategorizeBatch).mockResolvedValue({
      mappingNeeded: false,
      eventDateNeeded: false,
      mapping: [],
      rows: [{ tag: "AR2", eventDate: "2026-03-01", notes: null, status: "error", reason: "Caravana no encontrada" }],
    });

    render(<RecategorizeForm farms={farms} />);

    const user = userEvent.setup();
    await pickFarm();
    await user.upload(screen.getByLabelText("Archivo"), sampleFile());
    await user.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => expect(screen.getByText("Caravana no encontrada")).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Categoría destino (machos)"), "cat-novillo");
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  });

  it("shows an age-resolved row as confirmable without picking any target category", async () => {
    vi.mocked(listCategoriesAction).mockResolvedValue([
      { id: "cat-novillo", farmId: "group-1", name: "Novillo", sex: "male", minAgeMonths: null, active: true },
    ]);
    vi.mocked(previewRecategorizeBatch).mockResolvedValue({
      mappingNeeded: false,
      eventDateNeeded: false,
      mapping: [],
      rows: [
        {
          tag: "AR3",
          eventDate: "2026-03-01",
          notes: null,
          status: "age-resolved",
          animalId: "animal-3",
          currentEstablishmentId: "establishment-1",
          resolvedCategoryId: "cat-ternero",
          resolvedCategoryName: "Ternero/a",
        },
      ],
    });
    vi.mocked(confirmRecategorizeBatchAction).mockResolvedValue(undefined);

    render(<RecategorizeForm farms={farms} />);

    const user = userEvent.setup();
    await pickFarm();
    await user.upload(screen.getByLabelText("Archivo"), sampleFile());
    await user.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => expect(screen.getByText("Ternero/a")).toBeInTheDocument());
    // Confirmar still requires at least one target category chosen, even though
    // this particular row (age-resolved) doesn't need one itself.
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Categoría destino (machos)"), "cat-novillo");
    expect(screen.getByRole("button", { name: "Confirmar" })).not.toBeDisabled();

    await confirmViaDialog(user);
    await waitFor(() =>
      expect(confirmRecategorizeBatchAction).toHaveBeenCalledWith(
        expect.objectContaining({ unresolvableDecisions: {} })
      )
    );
  });

  it("lets the user override the global decision for an individual age-unresolvable row", async () => {
    vi.mocked(listCategoriesAction).mockResolvedValue([
      { id: "cat-novillo", farmId: "group-1", name: "Novillo", sex: "male", minAgeMonths: null, active: true },
    ]);
    vi.mocked(previewRecategorizeBatch).mockResolvedValue({
      mappingNeeded: false,
      eventDateNeeded: false,
      mapping: [],
      rows: [
        {
          tag: "AR4",
          eventDate: "2026-03-01",
          notes: null,
          status: "age-unresolvable",
          animalId: "animal-4",
          currentEstablishmentId: "establishment-1",
          sex: "male",
        },
      ],
    });
    vi.mocked(confirmRecategorizeBatchAction).mockResolvedValue(undefined);

    render(<RecategorizeForm farms={farms} />);

    const user = userEvent.setup();
    await pickFarm();
    await user.upload(screen.getByLabelText("Archivo"), sampleFile());
    await user.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => expect(screen.getByText("AR4")).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Categoría destino (machos)"), "cat-novillo");
    // Default global decision is "Omitir" — Confirmar stays disabled since there's nothing to change.
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();

    // Override just this row to "assignTarget".
    await user.selectOptions(screen.getByLabelText("Decisión para AR4"), "assignTarget");
    expect(screen.getByRole("button", { name: "Confirmar" })).not.toBeDisabled();

    await confirmViaDialog(user);
    await waitFor(() =>
      expect(confirmRecategorizeBatchAction).toHaveBeenCalledWith(
        expect.objectContaining({ unresolvableDecisions: { "animal-4": "assignTarget" } })
      )
    );
  });

  it("keeps a female row unconfirmable when only the male target category is chosen", async () => {
    vi.mocked(listCategoriesAction).mockResolvedValue([
      { id: "cat-novillo-macho", farmId: "group-1", name: "Novillo", sex: "male", minAgeMonths: null, active: true },
      { id: "cat-vaquillona", farmId: "group-1", name: "Vaquillona", sex: "female", minAgeMonths: null, active: true },
    ]);
    vi.mocked(previewRecategorizeBatch).mockResolvedValue({
      mappingNeeded: false,
      eventDateNeeded: false,
      mapping: [],
      rows: [
        {
          tag: "AR5",
          eventDate: "2026-03-01",
          notes: null,
          status: "existing",
          animalId: "animal-5",
          currentEstablishmentId: "establishment-1",
          currentCategoryId: "cat-vaca",
          currentCategoryName: "Vaca",
          sex: "female",
        },
      ],
    });
    vi.mocked(confirmRecategorizeBatchAction).mockResolvedValue(undefined);

    render(<RecategorizeForm farms={farms} />);

    const user = userEvent.setup();
    await pickFarm();
    await user.upload(screen.getByLabelText("Archivo"), sampleFile());
    await user.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => expect(screen.getByText("AR5")).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Categoría destino (machos)"), "cat-novillo-macho");
    // AR5 is female, and no target was chosen for hembras — nothing to confirm.
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Categoría destino (hembras)"), "cat-vaquillona");
    expect(screen.getByRole("button", { name: "Confirmar" })).not.toBeDisabled();

    await confirmViaDialog(user);
    await waitFor(() =>
      expect(confirmRecategorizeBatchAction).toHaveBeenCalledWith(
        expect.objectContaining({ targetCategoryIdBySex: { male: "cat-novillo-macho", female: "cat-vaquillona" } })
      )
    );
  });
});
