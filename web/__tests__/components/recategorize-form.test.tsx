import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecategorizeForm } from "@/components/activities/recategorize-form";
import { previewRecategorizeBatch, confirmRecategorizeBatchAction } from "@/app/(protected)/activities/recategorize/actions";

afterEach(cleanup);

vi.mock("@/app/(protected)/activities/recategorize/actions", () => ({
  previewRecategorizeBatch: vi.fn(),
  confirmRecategorizeBatchAction: vi.fn(),
}));

function sampleFile(): File {
  return new File(["Caravana,Fecha\nAR1,2026-03-01"], "lote.csv", { type: "text/csv" });
}

describe("RecategorizeForm", () => {
  it("uploads a file without asking for a farm, previews resolved rows, and confirms", async () => {
    vi.mocked(previewRecategorizeBatch).mockResolvedValue({
      mappingNeeded: false,
      eventDateNeeded: false,
      headerSignature: "sig",
      mapping: [],
      rows: [
        {
          tag: "AR1",
          eventDate: "2026-03-01",
          notes: null,
          status: "existing",
          animalId: "animal-1",
          currentFarmId: "farm-1",
          currentCategoryId: "cat-novillo",
          currentCategoryName: "Novillo",
        },
      ],
    });
    vi.mocked(confirmRecategorizeBatchAction).mockResolvedValue(undefined);

    render(
      <RecategorizeForm
        categories={[
          { id: "cat-novillo", name: "Novillo", sex: null, minAgeMonths: null },
          { id: "cat-novillo-plus3", name: "Novillo +3 años", sex: "male", minAgeMonths: 36 },
        ]}
      />
    );

    expect(screen.queryByLabelText("Campo")).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Categoría destino"), "cat-novillo-plus3");
    await user.upload(screen.getByLabelText("Archivo"), sampleFile());
    await user.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => expect(screen.getByText("AR1")).toBeInTheDocument());
    const table = screen.getByRole("table");
    expect(within(table).getByText("Novillo")).toBeInTheDocument();
    expect(within(table).getByText("Novillo +3 años")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() =>
      expect(confirmRecategorizeBatchAction).toHaveBeenCalledWith({
        headerSignature: "sig",
        mapping: [],
        targetCategoryId: "cat-novillo-plus3",
        rows: expect.any(Array),
        unresolvableDecisions: {},
      })
    );
    expect(screen.getByText("Lote confirmado.")).toBeInTheDocument();
  });

  it("shows the server's error message when confirming fails", async () => {
    vi.mocked(previewRecategorizeBatch).mockResolvedValue({
      mappingNeeded: false,
      eventDateNeeded: false,
      headerSignature: "sig",
      mapping: [],
      rows: [
        {
          tag: "AR1",
          eventDate: "2026-03-01",
          notes: null,
          status: "existing",
          animalId: "animal-1",
          currentFarmId: "farm-1",
          currentCategoryId: "cat-novillo",
          currentCategoryName: "Novillo",
        },
      ],
    });
    vi.mocked(confirmRecategorizeBatchAction).mockRejectedValue(
      new Error("El lote cambió desde que se generó la vista previa; volvé a subir el archivo.")
    );

    render(
      <RecategorizeForm
        categories={[
          { id: "cat-novillo", name: "Novillo", sex: null, minAgeMonths: null },
          { id: "cat-novillo-plus3", name: "Novillo +3 años", sex: "male", minAgeMonths: 36 },
        ]}
      />
    );

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Categoría destino"), "cat-novillo-plus3");
    await user.upload(screen.getByLabelText("Archivo"), sampleFile());
    await user.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => expect(screen.getByText("AR1")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() =>
      expect(
        screen.getByText("El lote cambió desde que se generó la vista previa; volvé a subir el archivo.")
      ).toBeInTheDocument()
    );
    // Still on the preview step, not the success state, and still retryable.
    expect(screen.queryByText("Lote confirmado.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar" })).not.toBeDisabled();

    // A second attempt clears the previous message first.
    vi.mocked(confirmRecategorizeBatchAction).mockResolvedValue(undefined);
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(screen.getByText("Lote confirmado.")).toBeInTheDocument());
  });

  it("disables Confirmar when a row has an error", async () => {
    vi.mocked(previewRecategorizeBatch).mockResolvedValue({
      mappingNeeded: false,
      eventDateNeeded: false,
      headerSignature: "sig",
      mapping: [],
      rows: [{ tag: "AR2", eventDate: "2026-03-01", notes: null, status: "error", reason: "Caravana no encontrada" }],
    });

    render(<RecategorizeForm categories={[{ id: "cat-novillo", name: "Novillo", sex: null, minAgeMonths: null }]} />);

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Categoría destino"), "cat-novillo");
    await user.upload(screen.getByLabelText("Archivo"), sampleFile());
    await user.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => expect(screen.getByText("Caravana no encontrada")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  });

  it("shows an age-resolved row as confirmable without needing the target category", async () => {
    vi.mocked(previewRecategorizeBatch).mockResolvedValue({
      mappingNeeded: false,
      eventDateNeeded: false,
      headerSignature: "sig",
      mapping: [],
      rows: [
        {
          tag: "AR3",
          eventDate: "2026-03-01",
          notes: null,
          status: "age-resolved",
          animalId: "animal-3",
          currentFarmId: "farm-1",
          resolvedCategoryId: "cat-ternero",
          resolvedCategoryName: "Ternero/a",
        },
      ],
    });
    vi.mocked(confirmRecategorizeBatchAction).mockResolvedValue(undefined);

    render(<RecategorizeForm categories={[{ id: "cat-novillo", name: "Novillo", sex: null, minAgeMonths: null }]} />);

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Categoría destino"), "cat-novillo");
    await user.upload(screen.getByLabelText("Archivo"), sampleFile());
    await user.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => expect(screen.getByText("Ternero/a")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Confirmar" })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() =>
      expect(confirmRecategorizeBatchAction).toHaveBeenCalledWith(
        expect.objectContaining({ unresolvableDecisions: {} })
      )
    );
  });

  it("lets the user override the global decision for an individual age-unresolvable row", async () => {
    vi.mocked(previewRecategorizeBatch).mockResolvedValue({
      mappingNeeded: false,
      eventDateNeeded: false,
      headerSignature: "sig",
      mapping: [],
      rows: [
        {
          tag: "AR4",
          eventDate: "2026-03-01",
          notes: null,
          status: "age-unresolvable",
          animalId: "animal-4",
          currentFarmId: "farm-1",
        },
      ],
    });
    vi.mocked(confirmRecategorizeBatchAction).mockResolvedValue(undefined);

    render(<RecategorizeForm categories={[{ id: "cat-novillo", name: "Novillo", sex: null, minAgeMonths: null }]} />);

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Categoría destino"), "cat-novillo");
    await user.upload(screen.getByLabelText("Archivo"), sampleFile());
    await user.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => expect(screen.getByText("AR4")).toBeInTheDocument());
    // Default global decision is "Omitir" — Confirmar stays disabled since there's nothing to change.
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();

    // Override just this row to "assignTarget".
    await user.selectOptions(screen.getByLabelText("Decisión para AR4"), "assignTarget");
    expect(screen.getByRole("button", { name: "Confirmar" })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() =>
      expect(confirmRecategorizeBatchAction).toHaveBeenCalledWith(
        expect.objectContaining({ unresolvableDecisions: { "animal-4": "assignTarget" } })
      )
    );
  });
});
