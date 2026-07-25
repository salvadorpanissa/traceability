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
  it("uploads a file, previews resolved rows, and confirms", async () => {
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
          currentCategoryId: "cat-novillo",
          currentCategoryName: "Novillo",
        },
      ],
    });
    vi.mocked(confirmRecategorizeBatchAction).mockResolvedValue(undefined);

    render(
      <RecategorizeForm
        farms={[{ id: "farm-1", name: "Campo Norte" }]}
        categories={[
          { id: "cat-novillo", name: "Novillo", sex: null, minAgeMonths: null },
          { id: "cat-novillo-plus3", name: "Novillo +3 años", sex: "male", minAgeMonths: 36 },
        ]}
      />
    );

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Campo"), "farm-1");
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
        farmId: "farm-1",
        rows: expect.any(Array),
      })
    );
    expect(screen.getByText("Lote confirmado.")).toBeInTheDocument();
  });

  it("disables Confirmar when a row has an error", async () => {
    vi.mocked(previewRecategorizeBatch).mockResolvedValue({
      mappingNeeded: false,
      eventDateNeeded: false,
      headerSignature: "sig",
      mapping: [],
      rows: [{ tag: "AR2", eventDate: "2026-03-01", notes: null, status: "error", reason: "Caravana no encontrada" }],
    });

    render(
      <RecategorizeForm
        farms={[{ id: "farm-1", name: "Campo Norte" }]}
        categories={[{ id: "cat-novillo", name: "Novillo", sex: null, minAgeMonths: null }]}
      />
    );

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Campo"), "farm-1");
    await user.selectOptions(screen.getByLabelText("Categoría destino"), "cat-novillo");
    await user.upload(screen.getByLabelText("Archivo"), sampleFile());
    await user.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => expect(screen.getByText("Caravana no encontrada")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  });
});
