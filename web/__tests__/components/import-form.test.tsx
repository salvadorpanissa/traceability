import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportForm } from "@/components/settings/import-form";

vi.mock("@/app/(protected)/settings/import/actions", () => ({
  parseImportFileAction: vi.fn(),
  previewImportAction: vi.fn(),
  importChunkAction: vi.fn(),
}));

const { parseImportFileAction, previewImportAction, importChunkAction } =
  await import("@/app/(protected)/settings/import/actions");

beforeEach(() => {
  vi.mocked(parseImportFileAction).mockReset();
  vi.mocked(previewImportAction).mockReset();
  vi.mocked(importChunkAction).mockReset();
  // Default preview: every row previewed will "crear" unless a test overrides it.
  vi.mocked(previewImportAction).mockImplementation(async (rows) =>
    rows.map((row) => ({ tag: row.tag, action: "crear" as const })),
  );
});

async function goToPreview() {
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Continuar" }),
    ).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Confirmar importación" }),
    ).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirmar importación" }));
}

describe("ImportForm", () => {
  it("parses the uploaded file, shows a preview, then imports in chunks and shows the summary", async () => {
    vi.mocked(parseImportFileAction).mockResolvedValue({
      headers: ["IDE (caravana electrónica)", "Estancia"],
      rows: [
        ["TAG1", "San Antonio"],
        ["TAG2", "San Antonio"],
      ],
    });
    vi.mocked(importChunkAction).mockResolvedValue({
      createdCount: 2,
      updatedCount: 0,
      errors: [],
    });

    render(<ImportForm />);

    const file = new File(["contenido"], "base.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const input = screen.getByLabelText("Archivo") as HTMLInputElement;
    await userEvent.upload(input, file);
    fireEvent.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Continuar" }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() =>
      expect(screen.getByText(/Se crearán 2 animales/)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirmar importación" }));

    await waitFor(() =>
      expect(screen.getByText(/2 filas creadas/)).toBeInTheDocument(),
    );
    expect(importChunkAction).toHaveBeenCalledTimes(1);
    expect(importChunkAction).toHaveBeenCalledWith([
      expect.objectContaining({
        tag: "TAG1",
        establishmentName: "San Antonio",
      }),
      expect.objectContaining({
        tag: "TAG2",
        establishmentName: "San Antonio",
      }),
    ]);
  });

  it("shows the error rows in the preview and in the final summary", async () => {
    vi.mocked(parseImportFileAction).mockResolvedValue({
      headers: ["IDE (caravana electrónica)", "Estancia"],
      rows: [["", "San Antonio"]],
    });
    vi.mocked(previewImportAction).mockResolvedValue([
      { tag: "", action: "error", reason: "Falta la caravana" },
    ]);
    vi.mocked(importChunkAction).mockResolvedValue({
      createdCount: 0,
      updatedCount: 0,
      errors: [{ tag: "", reason: "Falta la caravana" }],
    });

    render(<ImportForm />);

    const input = screen.getByLabelText("Archivo") as HTMLInputElement;
    await userEvent.upload(input, new File(["x"], "base.xlsx"));
    fireEvent.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Continuar" }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() =>
      expect(screen.getAllByText("Falta la caravana").length).toBeGreaterThan(0),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirmar importación" }));

    await waitFor(() =>
      expect(screen.getByText("Falta la caravana")).toBeInTheDocument(),
    );
  });

  it("dispatches chunks sequentially, one in flight at a time, never in parallel", async () => {
    const headers = ["IDE (caravana electrónica)", "Estancia"];
    const rows = Array.from({ length: 250 }, (_, i) => [
      `TAG${i + 1}`,
      "San Antonio",
    ]);
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
      return { createdCount: chunkRows.length, updatedCount: 0, errors: [] };
    });

    render(<ImportForm />);

    const input = screen.getByLabelText("Archivo") as HTMLInputElement;
    await userEvent.upload(input, new File(["x"], "base.xlsx"));
    fireEvent.click(screen.getByRole("button", { name: "Subir" }));

    await goToPreview();

    await waitFor(() =>
      expect(screen.getByText(/250 filas creadas/)).toBeInTheDocument(),
    );

    expect(importChunkAction).toHaveBeenCalledTimes(2);
    expect(inFlightAtCallStart).toEqual([false, false]);
    expect(importChunkAction).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([expect.objectContaining({ tag: "TAG1" })]),
    );
    const firstCallArg = vi.mocked(importChunkAction).mock.calls[0][0];
    const secondCallArg = vi.mocked(importChunkAction).mock.calls[1][0];
    expect(firstCallArg).toHaveLength(200);
    expect(secondCallArg).toHaveLength(50);
  });

  it("catches a tag duplicated across what would be two different chunks as a file-level duplicate, without sending either row to the server", async () => {
    const headers = ["IDE (caravana electrónica)", "Estancia"];
    // 250 rows so a naive per-chunk (200-row) dedup would miss a tag repeated
    // between row 0 (chunk 1) and row 205 (chunk 2).
    const rows = Array.from({ length: 250 }, (_, i) => [
      `TAG${i + 1}`,
      "San Antonio",
    ]);
    rows[0] = ["DUPTAG", "San Antonio"];
    rows[205] = ["DUPTAG", "San Antonio"];
    vi.mocked(parseImportFileAction).mockResolvedValue({ headers, rows });
    vi.mocked(importChunkAction).mockImplementation(async (chunkRows) => ({
      createdCount: chunkRows.length,
      updatedCount: 0,
      errors: [],
    }));

    render(<ImportForm />);

    const input = screen.getByLabelText("Archivo") as HTMLInputElement;
    await userEvent.upload(input, new File(["x"], "base.xlsx"));
    fireEvent.click(screen.getByRole("button", { name: "Subir" }));

    await goToPreview();

    // 250 rows - 2 file-duplicate rows = 248 sent to the server.
    await waitFor(() =>
      expect(screen.getByText(/248 filas creadas/)).toBeInTheDocument(),
    );

    expect(
      screen.getAllByText("Caravana duplicada en el archivo").length,
    ).toBeGreaterThan(0);

    const allSentRows = vi
      .mocked(importChunkAction)
      .mock.calls.flatMap((args) => args[0]);
    expect(allSentRows.some((r) => r.tag === "DUPTAG")).toBe(false);
    expect(allSentRows).toHaveLength(248);
  });

  it("preserves accumulated progress when a later chunk fails, and lets the admin restart", async () => {
    const headers = ["IDE (caravana electrónica)", "Estancia"];
    const rows = Array.from({ length: 250 }, (_, i) => [
      `TAG${i + 1}`,
      "San Antonio",
    ]);
    vi.mocked(parseImportFileAction).mockResolvedValue({ headers, rows });

    vi.mocked(importChunkAction).mockImplementationOnce(async (chunkRows) => ({
      createdCount: chunkRows.length,
      updatedCount: 0,
      errors: [],
    }));
    vi.mocked(importChunkAction).mockImplementationOnce(async () => {
      throw new Error("Chip secundario o caravana duplicados");
    });

    render(<ImportForm />);

    const input = screen.getByLabelText("Archivo") as HTMLInputElement;
    await userEvent.upload(input, new File(["x"], "base.xlsx"));
    fireEvent.click(screen.getByRole("button", { name: "Subir" }));

    await goToPreview();

    await waitFor(() =>
      expect(
        screen.getByText("Chip secundario o caravana duplicados"),
      ).toBeInTheDocument(),
    );
    // The first chunk's 200 created rows must still be shown, not discarded.
    expect(screen.getByText(/200 filas creadas/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Volver a empezar" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Archivo")).toBeInTheDocument(),
    );
  });
});
