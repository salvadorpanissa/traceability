import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

afterEach(cleanup);

type Row = { id: string; name: string; count: number };

const rows: Row[] = [
  { id: "1", name: "Banana", count: 3 },
  { id: "2", name: "Apple", count: 10 },
  { id: "3", name: "Cherry", count: 1 },
];

const baseColumns: DataTableColumn<Row>[] = [
  { key: "name", header: "Nombre", render: (r) => r.name, sortValue: (r) => r.name, searchValue: (r) => r.name },
  { key: "count", header: "Cantidad", render: (r) => r.count, sortValue: (r) => r.count },
];

describe("DataTable", () => {
  it("renders columns and rows", () => {
    render(<DataTable columns={baseColumns} rows={rows} getRowId={(r) => r.id} locale="es" />);
    expect(screen.getByText("Nombre")).toBeInTheDocument();
    expect(screen.getByText("Banana")).toBeInTheDocument();
    expect(screen.getByText("Apple")).toBeInTheDocument();
    expect(screen.getByText("Cherry")).toBeInTheDocument();
  });

  it("shows the empty message when there are no rows", () => {
    render(<DataTable columns={baseColumns} rows={[]} getRowId={(r) => r.id} locale="es" />);
    expect(screen.getByText("No hay resultados.")).toBeInTheDocument();
  });

  it("does not render a search box unless searchable is set", () => {
    render(<DataTable columns={baseColumns} rows={rows} getRowId={(r) => r.id} locale="es" />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("filters rows by the search query across searchable columns", async () => {
    render(<DataTable columns={baseColumns} rows={rows} getRowId={(r) => r.id} locale="es" searchable />);
    const user = userEvent.setup();

    await user.type(screen.getByRole("textbox"), "an");

    expect(screen.getByText("Banana")).toBeInTheDocument();
    expect(screen.queryByText("Apple")).not.toBeInTheDocument();
    expect(screen.queryByText("Cherry")).not.toBeInTheDocument();
  });

  it("does not render sort controls for columns without sortValue", () => {
    const columns: DataTableColumn<Row>[] = [{ key: "name", header: "Nombre", render: (r) => r.name }];
    render(<DataTable columns={columns} rows={rows} getRowId={(r) => r.id} locale="es" />);
    expect(screen.queryByRole("button", { name: /nombre/i })).not.toBeInTheDocument();
  });

  it("sorts ascending then descending then back to original order on repeated header clicks", async () => {
    render(<DataTable columns={baseColumns} rows={rows} getRowId={(r) => r.id} locale="es" />);
    const user = userEvent.setup();

    function currentOrder() {
      return screen.getAllByRole("row").slice(1).map((row) => row.textContent);
    }

    await user.click(screen.getByRole("button", { name: /nombre/i }));
    expect(currentOrder()[0]).toContain("Apple");

    await user.click(screen.getByRole("button", { name: /nombre/i }));
    expect(currentOrder()[0]).toContain("Cherry");

    await user.click(screen.getByRole("button", { name: /nombre/i }));
    expect(currentOrder()[0]).toContain("Banana");
  });

  it("does not render an expand toggle unless expandable is set", () => {
    render(<DataTable columns={baseColumns} rows={rows} getRowId={(r) => r.id} locale="es" />);
    expect(screen.queryByRole("button", { name: /expandir/i })).not.toBeInTheDocument();
  });

  it("expands a row to show its detail content, and collapses it back", async () => {
    render(
      <DataTable
        columns={baseColumns}
        rows={rows}
        getRowId={(r) => r.id}
        locale="es"
        expandable
        renderExpanded={(r) => <p>Detalle de {r.name}</p>}
      />
    );
    const user = userEvent.setup();

    expect(screen.queryByText("Detalle de Banana")).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /expandir/i })[0]);
    expect(screen.getByText("Detalle de Banana")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /contraer/i }));
    expect(screen.queryByText("Detalle de Banana")).not.toBeInTheDocument();
  });

  it("paginates with page number buttons when pageSize is set", async () => {
    render(<DataTable columns={baseColumns} rows={rows} getRowId={(r) => r.id} locale="es" pageSize={2} />);
    const user = userEvent.setup();

    expect(screen.getByText("Banana")).toBeInTheDocument();
    expect(screen.getByText("Apple")).toBeInTheDocument();
    expect(screen.queryByText("Cherry")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Página 2" }));
    expect(screen.getByText("Cherry")).toBeInTheDocument();
  });

  it("resets pagination back to the first page when the search query changes", async () => {
    render(<DataTable columns={baseColumns} rows={rows} getRowId={(r) => r.id} locale="es" searchable pageSize={1} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Página 2" }));
    expect(screen.getAllByRole("row")).toHaveLength(2); // header + 1 row (Apple)

    await user.type(screen.getByRole("textbox"), "Apple");
    expect(screen.getAllByRole("row")).toHaveLength(2); // header + 1 row (Apple still)
  });

  it("truncates page buttons to the current page, its next 3, an ellipsis, then the last page", () => {
    const manyRows: Row[] = Array.from({ length: 100 }, (_, i) => ({ id: String(i), name: `Row ${i}`, count: i }));
    render(<DataTable columns={baseColumns} rows={manyRows} getRowId={(r) => r.id} locale="es" pageSize={10} />);

    // Page 1 (index 0): current + next 3 => 1,2,3,4, then … then last page 10.
    for (const label of ["Página 1", "Página 2", "Página 3", "Página 4", "Página 10"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Página 5" })).not.toBeInTheDocument();
    expect(screen.getByText("…")).toBeInTheDocument();
  });

  it("jumps directly to the last page from the truncated pagination", async () => {
    const manyRows: Row[] = Array.from({ length: 100 }, (_, i) => ({ id: String(i), name: `Row ${i}`, count: i }));
    render(<DataTable columns={baseColumns} rows={manyRows} getRowId={(r) => r.id} locale="es" pageSize={10} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Página 10" }));
    expect(screen.getByText("Row 99")).toBeInTheDocument();
  });

  it("keeps a page-1 anchor visible once paged in near the end, instead of stranding you with no way back", async () => {
    const manyRows: Row[] = Array.from({ length: 100 }, (_, i) => ({ id: String(i), name: `Row ${i}`, count: i }));
    render(<DataTable columns={baseColumns} rows={manyRows} getRowId={(r) => r.id} locale="es" pageSize={10} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Página 10" }));
    // Paging backward one step at a time (as clicking the previous chevron
    // would) must never lose the page-1 button — that was the original bug.
    await user.click(screen.getByRole("button", { name: "Página anterior" }));
    await user.click(screen.getByRole("button", { name: "Página anterior" }));

    expect(screen.getByRole("button", { name: "Página 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Página 8" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Página 9" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Página 10" })).toBeInTheDocument();
    expect(screen.getAllByText("…")).toHaveLength(1);
  });

  it("does not render a download button unless exportable is set", () => {
    render(<DataTable columns={baseColumns} rows={rows} getRowId={(r) => r.id} locale="es" />);
    expect(screen.queryByRole("button", { name: /descargar excel/i })).not.toBeInTheDocument();
  });

  it("downloads an xlsx file of the current (filtered/sorted) rows when exportable", async () => {
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(
      <DataTable
        columns={baseColumns}
        rows={rows}
        getRowId={(r) => r.id}
        locale="es"
        exportable
        exportFileName="mi-tabla"
      />
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /descargar excel/i }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("disables the download button when there are no rows to export", () => {
    render(<DataTable columns={baseColumns} rows={[]} getRowId={(r) => r.id} locale="es" exportable />);
    expect(screen.getByRole("button", { name: /descargar excel/i })).toBeDisabled();
  });

  it("writes extraSheets to the workbook alongside the main sheet", async () => {
    // jsdom's Blob doesn't round-trip binary content reliably, so capture the
    // raw ArrayBuffer ExcelJS hands to `new Blob([buffer], ...)` instead of
    // reading it back out of the Blob.
    let capturedBuffer: ArrayBuffer | null = null;
    const OriginalBlob = globalThis.Blob;
    class SpyBlob extends OriginalBlob {
      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        capturedBuffer = parts[0] as ArrayBuffer;
      }
    }
    vi.stubGlobal("Blob", SpyBlob);
    const createObjectURL = vi.fn(() => "blob:mock-url");
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(
      <DataTable
        columns={baseColumns}
        rows={rows}
        getRowId={(r) => r.id}
        locale="es"
        exportable
        extraSheets={[{ name: "Detalle", headers: ["Col"], rows: [["valor"]] }]}
      />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /descargar excel/i }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(capturedBuffer!);
    expect(workbook.worksheets.map((s) => s.name)).toEqual(["Datos", "Detalle"]);
    expect(workbook.getWorksheet("Detalle")!.getRow(1).getCell(1).value).toBe("Col");
    expect(workbook.getWorksheet("Detalle")!.getRow(2).getCell(1).value).toBe("valor");

    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
