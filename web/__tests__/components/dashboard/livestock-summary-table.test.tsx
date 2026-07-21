import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LivestockSummaryTable } from "@/components/dashboard/livestock-summary-table";
import type { LivestockSummaryRow } from "@/lib/dashboard/livestock-summary";

describe("LivestockSummaryTable", () => {
  it("shows one row per farm/category group with its count", () => {
    const rows: LivestockSummaryRow[] = [
      { farmName: "Campo Norte", categoryName: "Vaca", count: 2 },
      { farmName: "Campo Norte", categoryName: "Novillo", count: 1 },
    ];

    render(<LivestockSummaryTable rows={rows} locale="es" />);

    expect(screen.getAllByText("Campo Norte")).toHaveLength(2);
    expect(screen.getByText("Vaca")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Novillo")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("shows placeholders for null farm/category", () => {
    const rows: LivestockSummaryRow[] = [{ farmName: null, categoryName: null, count: 3 }];

    render(<LivestockSummaryTable rows={rows} locale="es" />);

    expect(screen.getByText("Sin campo")).toBeInTheDocument();
    expect(screen.getByText("Sin categoría")).toBeInTheDocument();
  });

  it("shows an empty-state message when there are no groups", () => {
    render(<LivestockSummaryTable rows={[]} locale="es" />);
    expect(screen.getByText("No hay animales vivos para resumir.")).toBeInTheDocument();
  });
});
