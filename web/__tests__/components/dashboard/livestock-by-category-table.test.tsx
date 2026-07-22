import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LivestockByCategoryTable } from "@/components/dashboard/livestock-by-category-table";
import type { LivestockByCategoryRow } from "@/lib/dashboard/livestock-summary";

describe("LivestockByCategoryTable", () => {
  it("shows one row per category group with its count", () => {
    const rows: LivestockByCategoryRow[] = [
      { categoryName: "Vaca", count: 2 },
      { categoryName: "Novillo", count: 1 },
    ];

    render(<LivestockByCategoryTable rows={rows} locale="es" />);

    expect(screen.getByText("Vaca")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Novillo")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("shows a placeholder for a null category", () => {
    const rows: LivestockByCategoryRow[] = [{ categoryName: null, count: 3 }];

    render(<LivestockByCategoryTable rows={rows} locale="es" />);

    expect(screen.getByText("Sin categoría")).toBeInTheDocument();
  });

  it("shows an empty-state message when there are no groups", () => {
    render(<LivestockByCategoryTable rows={[]} locale="es" />);
    expect(screen.getByText("No hay animales vivos para mostrar por categoría.")).toBeInTheDocument();
  });
});
