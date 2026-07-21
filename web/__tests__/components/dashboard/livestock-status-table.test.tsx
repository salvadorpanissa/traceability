import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LivestockStatusTable } from "@/components/dashboard/livestock-status-table";
import type { AnimalCurrentStateWithNames } from "@/lib/dal/animal-access";

describe("LivestockStatusTable", () => {
  it("shows one row per animal with resolved names", () => {
    const rows: AnimalCurrentStateWithNames[] = [
      {
        animalId: "a1",
        currentTag: "AR000000000050",
        currentFarmId: "f1",
        farmName: "Campo Norte",
        currentPaddockId: "p1",
        paddockName: "Potrero 1",
        currentCategoryId: "c1",
        categoryName: "Vaca",
        status: "alive",
      },
    ];

    render(<LivestockStatusTable rows={rows} locale="es" />);

    expect(screen.getByText("AR000000000050")).toBeInTheDocument();
    expect(screen.getByText("Campo Norte")).toBeInTheDocument();
    expect(screen.getByText("Potrero 1")).toBeInTheDocument();
    expect(screen.getByText("Vaca")).toBeInTheDocument();
    expect(screen.getByText("Vivo")).toBeInTheDocument();
  });

  it("shows a dash for unset paddock/category and a translated status", () => {
    const rows: AnimalCurrentStateWithNames[] = [
      {
        animalId: "a2",
        currentTag: "AR000000000051",
        currentFarmId: "f1",
        farmName: "Campo Norte",
        currentPaddockId: null,
        paddockName: null,
        currentCategoryId: null,
        categoryName: null,
        status: "sold",
      },
    ];

    render(<LivestockStatusTable rows={rows} locale="es" />);

    expect(screen.getByText("Vendido")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("shows an empty-state message when there are no animals", () => {
    render(<LivestockStatusTable rows={[]} locale="es" />);
    expect(screen.getByText("No hay animales para mostrar.")).toBeInTheDocument();
  });
});
