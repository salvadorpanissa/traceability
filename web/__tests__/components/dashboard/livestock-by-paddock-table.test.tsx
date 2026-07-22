import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LivestockByPaddockTable } from "@/components/dashboard/livestock-by-paddock-table";
import type { LivestockByPaddockRow } from "@/lib/dashboard/livestock-summary";

describe("LivestockByPaddockTable", () => {
  it("shows one row per farm/paddock group with its count", () => {
    const rows: LivestockByPaddockRow[] = [
      { farmName: "Campo Norte", paddockName: "Potrero 1", count: 2 },
      { farmName: "Campo Norte", paddockName: "Potrero 2", count: 1 },
    ];

    render(<LivestockByPaddockTable rows={rows} locale="es" />);

    expect(screen.getAllByText("Campo Norte")).toHaveLength(2);
    expect(screen.getByText("Potrero 1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Potrero 2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("shows placeholders for null farm/paddock", () => {
    const rows: LivestockByPaddockRow[] = [{ farmName: null, paddockName: null, count: 3 }];

    render(<LivestockByPaddockTable rows={rows} locale="es" />);

    expect(screen.getByText("Sin campo")).toBeInTheDocument();
    expect(screen.getByText("Sin potrero")).toBeInTheDocument();
  });

  it("shows an empty-state message when there are no groups", () => {
    render(<LivestockByPaddockTable rows={[]} locale="es" />);
    expect(screen.getByText("No hay animales vivos para mostrar por potrero.")).toBeInTheDocument();
  });
});
