import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LivestockByPaddockTable } from "@/components/dashboard/livestock-by-paddock-table";
import type { LivestockByPaddockRow } from "@/lib/dashboard/livestock-summary";

afterEach(cleanup);

describe("LivestockByPaddockTable", () => {
  it("shows one row per farm/paddock group with its count", () => {
    const rows: LivestockByPaddockRow[] = [
      { farmName: "Campo Norte", paddockName: "Potrero 1", count: 2, animals: [] },
      { farmName: "Campo Norte", paddockName: "Potrero 2", count: 1, animals: [] },
    ];

    render(<LivestockByPaddockTable rows={rows} locale="es" />);

    expect(screen.getAllByText("Campo Norte")).toHaveLength(2);
    expect(screen.getByText("Potrero 1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Potrero 2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("shows placeholders for null farm/paddock", () => {
    const rows: LivestockByPaddockRow[] = [{ farmName: null, paddockName: null, count: 3, animals: [] }];

    render(<LivestockByPaddockTable rows={rows} locale="es" />);

    expect(screen.getByText("Sin campo")).toBeInTheDocument();
    expect(screen.getByText("Sin potrero")).toBeInTheDocument();
  });

  it("shows an empty-state message when there are no groups", () => {
    render(<LivestockByPaddockTable rows={[]} locale="es" />);
    expect(screen.getByText("No hay animales vivos para mostrar por potrero.")).toBeInTheDocument();
  });

  it("expands a group to list its animal tags", async () => {
    const rows: LivestockByPaddockRow[] = [
      {
        farmName: "Campo Norte",
        paddockName: "Potrero 1",
        count: 2,
        animals: [
          { animalId: "a1", tag: "AR1" },
          { animalId: "a2", tag: "AR2" },
        ],
      },
    ];

    render(<LivestockByPaddockTable rows={rows} locale="es" />);
    const user = userEvent.setup();

    expect(screen.queryByText("AR1, AR2")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /expandir/i }));
    expect(screen.getByText("AR1, AR2")).toBeInTheDocument();
  });
});
