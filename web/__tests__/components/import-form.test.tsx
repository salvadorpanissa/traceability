import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportForm } from "@/components/settings/import-form";

vi.mock("@/app/(protected)/settings/import/actions", () => ({
  parseImportFileAction: vi.fn(),
  importChunkAction: vi.fn(),
}));

const { parseImportFileAction, importChunkAction } = await import("@/app/(protected)/settings/import/actions");

beforeEach(() => {
  vi.mocked(parseImportFileAction).mockReset();
  vi.mocked(importChunkAction).mockReset();
});

describe("ImportForm", () => {
  it("parses the uploaded file, shows the column mapper, then imports in chunks and shows the summary", async () => {
    vi.mocked(parseImportFileAction).mockResolvedValue({
      headers: ["IDE (caravana electrónica)", "Estancia"],
      rows: [
        ["TAG1", "San Antonio"],
        ["TAG2", "San Antonio"],
      ],
    });
    vi.mocked(importChunkAction).mockResolvedValue({ createdCount: 2, errors: [] });

    render(<ImportForm />);

    const file = new File(["contenido"], "base.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const input = screen.getByLabelText("Archivo Excel") as HTMLInputElement;
    await userEvent.upload(input, file);
    fireEvent.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByText(/2 filas creadas/)).toBeInTheDocument());
    expect(importChunkAction).toHaveBeenCalledTimes(1);
    expect(importChunkAction).toHaveBeenCalledWith([
      expect.objectContaining({ tag: "TAG1", farmName: "San Antonio" }),
      expect.objectContaining({ tag: "TAG2", farmName: "San Antonio" }),
    ]);
  });

  it("shows the error rows in the final summary", async () => {
    vi.mocked(parseImportFileAction).mockResolvedValue({
      headers: ["IDE (caravana electrónica)", "Estancia"],
      rows: [["", "San Antonio"]],
    });
    vi.mocked(importChunkAction).mockResolvedValue({
      createdCount: 0,
      errors: [{ tag: "", reason: "Falta la caravana" }],
    });

    render(<ImportForm />);

    const input = screen.getByLabelText("Archivo Excel") as HTMLInputElement;
    await userEvent.upload(input, new File(["x"], "base.xlsx"));
    fireEvent.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByText("Falta la caravana")).toBeInTheDocument());
  });
});
