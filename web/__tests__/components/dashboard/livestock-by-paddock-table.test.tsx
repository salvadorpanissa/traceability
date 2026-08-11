import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LivestockByPaddockTable } from "@/components/dashboard/livestock-by-paddock-table";
import type { LivestockByPaddockRow } from "@/lib/dashboard/livestock-summary";

afterEach(cleanup);

describe("LivestockByPaddockTable", () => {
  it("shows one row per establishment/paddock group with its count", () => {
    const rows: LivestockByPaddockRow[] = [
      { establishmentName: "Campo Norte", paddockName: "Potrero 1", count: 2, animals: [] },
      { establishmentName: "Campo Norte", paddockName: "Potrero 2", count: 1, animals: [] },
    ];

    render(<LivestockByPaddockTable rows={rows} locale="es" />);

    expect(screen.getAllByText("Campo Norte")).toHaveLength(2);
    expect(screen.getByText("Potrero 1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Potrero 2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("shows placeholders for null establishment/paddock", () => {
    const rows: LivestockByPaddockRow[] = [{ establishmentName: null, paddockName: null, count: 3, animals: [] }];

    render(<LivestockByPaddockTable rows={rows} locale="es" />);

    expect(screen.getByText("Sin campo")).toBeInTheDocument();
    expect(screen.getByText("Sin potrero")).toBeInTheDocument();
  });

  it("shows an empty-state message when there are no groups", () => {
    render(<LivestockByPaddockTable rows={[]} locale="es" />);
    expect(screen.getByText("No hay animales vivos para mostrar por potrero.")).toBeInTheDocument();
  });

  it("expands a group to show a table with each animal's data", async () => {
    const rows: LivestockByPaddockRow[] = [
      {
        establishmentName: "Campo Norte",
        paddockName: "Potrero 1",
        count: 2,
        animals: [
          {
            animalId: "a1",
            tag: "AR1",
            categoryName: "Vaca",
            secondaryTag: "CHIP1",
            sex: "female",
            breed: "Hereford",
            ownerName: "SASG",
            birthDate: "2021-01-01",
          },
          {
            animalId: "a2",
            tag: "AR2",
            categoryName: null,
            secondaryTag: null,
            sex: null,
            breed: null,
            ownerName: null,
            birthDate: null,
          },
        ],
      },
    ];

    render(<LivestockByPaddockTable rows={rows} locale="es" />);
    const user = userEvent.setup();

    expect(screen.queryByText("AR1")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /expandir/i }));

    expect(screen.getByText("AR1")).toBeInTheDocument();
    expect(screen.getByText("CHIP1")).toBeInTheDocument();
    expect(screen.getByText("Vaca")).toBeInTheDocument();
    expect(screen.getByText("Hembra")).toBeInTheDocument();
    expect(screen.getByText("Hereford")).toBeInTheDocument();
    expect(screen.getByText("SASG")).toBeInTheDocument();
    expect(screen.getByText("2021-01-01")).toBeInTheDocument();

    expect(screen.getByText("AR2")).toBeInTheDocument();
    expect(screen.getByText("Sin categoría")).toBeInTheDocument();
    expect(screen.getByText("Sin dato")).toBeInTheDocument();
  });
});
