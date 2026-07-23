import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LivestockByCategoryTable } from "@/components/dashboard/livestock-by-category-table";
import type { LivestockByCategoryRow } from "@/lib/dashboard/livestock-summary";

afterEach(cleanup);

describe("LivestockByCategoryTable", () => {
  it("shows one row per category group with its count", () => {
    const rows: LivestockByCategoryRow[] = [
      { categoryName: "Vaca", count: 2, animals: [] },
      { categoryName: "Novillo", count: 1, animals: [] },
    ];

    render(<LivestockByCategoryTable rows={rows} locale="es" />);

    expect(screen.getByText("Vaca")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Novillo")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("shows a placeholder for a null category", () => {
    const rows: LivestockByCategoryRow[] = [{ categoryName: null, count: 3, animals: [] }];

    render(<LivestockByCategoryTable rows={rows} locale="es" />);

    expect(screen.getByText("Sin categoría")).toBeInTheDocument();
  });

  it("shows an empty-state message when there are no groups", () => {
    render(<LivestockByCategoryTable rows={[]} locale="es" />);
    expect(screen.getByText("No hay animales vivos para mostrar por categoría.")).toBeInTheDocument();
  });

  it("expands a group to list its animal tags", async () => {
    const rows: LivestockByCategoryRow[] = [
      { categoryName: "Vaca", count: 2, animals: [{ animalId: "a1", tag: "AR1" }, { animalId: "a2", tag: "AR2" }] },
    ];

    render(<LivestockByCategoryTable rows={rows} locale="es" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /expandir/i }));
    expect(screen.getByText("AR1, AR2")).toBeInTheDocument();
  });
});
