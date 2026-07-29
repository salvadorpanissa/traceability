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

  it("dispatches chunks sequentially, one in flight at a time, never in parallel", async () => {
    const headers = ["IDE (caravana electrónica)", "Estancia"];
    const rows = Array.from({ length: 250 }, (_, i) => [`TAG${i + 1}`, "San Antonio"]);
    vi.mocked(parseImportFileAction).mockResolvedValue({ headers, rows });

    let inFlight = false;
    // Records, synchronously at the moment each call starts, whether a
    // previous call was still in flight. A parallel (Promise.all-style)
    // dispatch would start the second call while the first is still
    // "in flight" (true here isn't reset until after its delay), so this
    // array would contain `true` if dispatch weren't sequential.
    const inFlightAtCallStart: boolean[] = [];

    vi.mocked(importChunkAction).mockImplementation(async (chunkRows) => {
      inFlightAtCallStart.push(inFlight);
      inFlight = true;

      if (chunkRows.length === 200) {
        // Delay the first chunk so a parallel dispatch would have already
        // started the second chunk's mock before this one resolves.
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      inFlight = false;
      return { createdCount: chunkRows.length, errors: [] };
    });

    render(<ImportForm />);

    const input = screen.getByLabelText("Archivo Excel") as HTMLInputElement;
    await userEvent.upload(input, new File(["x"], "base.xlsx"));
    fireEvent.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByText(/250 filas creadas/)).toBeInTheDocument());

    expect(importChunkAction).toHaveBeenCalledTimes(2);
    expect(inFlightAtCallStart).toEqual([false, false]);
    expect(importChunkAction).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([expect.objectContaining({ tag: "TAG1" })])
    );
    const firstCallArg = vi.mocked(importChunkAction).mock.calls[0][0];
    const secondCallArg = vi.mocked(importChunkAction).mock.calls[1][0];
    expect(firstCallArg).toHaveLength(200);
    expect(secondCallArg).toHaveLength(50);
  });
});
