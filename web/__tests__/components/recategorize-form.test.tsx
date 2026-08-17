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
  await waitFor(() => expect(screen.getByLabelText("Categoría destino")).not.toBeDisabled());
}

describe("RecategorizeForm", () => {
  it("asks for a campo, loads that campo's categories, previews resolved rows, and confirms", async () => {
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
          sex: null,
        },
      ],
    });
    vi.mocked(confirmRecategorizeBatchAction).mockResolvedValue(undefined);

    render(<RecategorizeForm farms={farms} />);

    const user = userEvent.setup();
    await pickFarm();

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
        mapping: [],
        farmId: "farm-1",
        targetCategoryId: "cat-novillo-plus3",
        rows: expect.any(Array),
        unresolvableDecisions: {},
        sexMismatchDecisions: {},
      })
    );
    expect(screen.getByText("Lote confirmado.")).toBeInTheDocument();
  });

  it("shows the server's error message when confirming fails", async () => {
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
          sex: null,
        },
      ],
    });
    vi.mocked(confirmRecategorizeBatchAction).mockRejectedValue(
      new Error("El lote cambió desde que se generó la vista previa; volvé a subir el archivo.")
    );

    render(<RecategorizeForm farms={farms} />);

    const user = userEvent.setup();
    await pickFarm();
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
    vi.mocked(listCategoriesAction).mockResolvedValue([
      { id: "cat-novillo", farmId: "group-1", name: "Novillo", sex: null, minAgeMonths: null, active: true },
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
    await user.selectOptions(screen.getByLabelText("Categoría destino"), "cat-novillo");
    await user.upload(screen.getByLabelText("Archivo"), sampleFile());
    await user.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => expect(screen.getByText("Caravana no encontrada")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  });

  it("shows an age-resolved row as confirmable without needing the target category", async () => {
    vi.mocked(listCategoriesAction).mockResolvedValue([
      { id: "cat-novillo", farmId: "group-1", name: "Novillo", sex: null, minAgeMonths: null, active: true },
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
    vi.mocked(listCategoriesAction).mockResolvedValue([
      { id: "cat-novillo", farmId: "group-1", name: "Novillo", sex: null, minAgeMonths: null, active: true },
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
          sex: null,
        },
      ],
    });
    vi.mocked(confirmRecategorizeBatchAction).mockResolvedValue(undefined);

    render(<RecategorizeForm farms={farms} />);

    const user = userEvent.setup();
    await pickFarm();
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

  it("excludes a sex-mismatched existing row by default, and includes it when overridden to assignTarget", async () => {
    vi.mocked(listCategoriesAction).mockResolvedValue([
      { id: "cat-vaca", farmId: "group-1", name: "Vaca", sex: null, minAgeMonths: null, active: true },
      { id: "cat-novillo-macho", farmId: "group-1", name: "Novillo", sex: "male", minAgeMonths: null, active: true },
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
    await user.selectOptions(screen.getByLabelText("Categoría destino"), "cat-novillo-macho");
    await user.upload(screen.getByLabelText("Archivo"), sampleFile());
    await user.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => expect(screen.getByText("AR5")).toBeInTheDocument());
    // Default global decision is "Omitir" — Confirmar stays disabled since there's nothing to change.
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Decisión de sexo para AR5"), "assignTarget");
    expect(screen.getByRole("button", { name: "Confirmar" })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() =>
      expect(confirmRecategorizeBatchAction).toHaveBeenCalledWith(
        expect.objectContaining({ sexMismatchDecisions: { "animal-5": "assignTarget" } })
      )
    );
  });

  it("shows a second decision selector on an age-unresolvable row once assigned to a mismatched target", async () => {
    vi.mocked(listCategoriesAction).mockResolvedValue([
      { id: "cat-novillo-macho", farmId: "group-1", name: "Novillo", sex: "male", minAgeMonths: null, active: true },
    ]);
    vi.mocked(previewRecategorizeBatch).mockResolvedValue({
      mappingNeeded: false,
      eventDateNeeded: false,
      mapping: [],
      rows: [
        {
          tag: "AR6",
          eventDate: "2026-03-01",
          notes: null,
          status: "age-unresolvable",
          animalId: "animal-6",
          currentEstablishmentId: "establishment-1",
          sex: "female",
        },
      ],
    });
    vi.mocked(confirmRecategorizeBatchAction).mockResolvedValue(undefined);

    render(<RecategorizeForm farms={farms} />);

    const user = userEvent.setup();
    await pickFarm();
    await user.selectOptions(screen.getByLabelText("Categoría destino"), "cat-novillo-macho");
    await user.upload(screen.getByLabelText("Archivo"), sampleFile());
    await user.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => expect(screen.getByText("AR6")).toBeInTheDocument());
    // The sex-mismatch selector only appears once the age decision is "assignTarget".
    expect(screen.queryByLabelText("Decisión de sexo para AR6")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Decisión para AR6"), "assignTarget");
    expect(screen.getByLabelText("Decisión de sexo para AR6")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Decisión de sexo para AR6"), "assignTarget");
    expect(screen.getByRole("button", { name: "Confirmar" })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() =>
      expect(confirmRecategorizeBatchAction).toHaveBeenCalledWith(
        expect.objectContaining({
          unresolvableDecisions: { "animal-6": "assignTarget" },
          sexMismatchDecisions: { "animal-6": "assignTarget" },
        })
      )
    );
  });
});
