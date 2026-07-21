import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LivestockStatusTable } from "@/components/dashboard/livestock-status-table";
import type { AnimalCurrentStateWithNames } from "@/lib/dal/animal-access";

// This project's vitest config doesn't enable `globals`, so
// @testing-library/react's automatic afterEach cleanup (which detects a
// global `afterEach`) never registers — without this, DOM from every test in
// this file accumulates, breaking role/text queries that are unique per
// render but repeated across tests (e.g. the "ver todos" button below).
afterEach(cleanup);

function buildRows(count: number): AnimalCurrentStateWithNames[] {
  return Array.from({ length: count }, (_, i) => ({
    animalId: `a${i}`,
    currentTag: `AR${i}`,
    currentFarmId: "f1",
    farmName: "Campo Norte",
    currentPaddockId: null,
    paddockName: null,
    currentCategoryId: null,
    categoryName: null,
    status: "alive",
  }));
}

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

  it("shows only the first 5 rows and a 'show all' button when there are more", () => {
    render(<LivestockStatusTable rows={buildRows(8)} locale="es" />);

    expect(screen.getByText("AR0")).toBeInTheDocument();
    expect(screen.getByText("AR4")).toBeInTheDocument();
    expect(screen.queryByText("AR5")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ver todos/i })).toBeInTheDocument();
  });

  it("expands to show every row after clicking 'show all', and can collapse again", async () => {
    render(<LivestockStatusTable rows={buildRows(8)} locale="es" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /ver todos/i }));
    expect(screen.getByText("AR7")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /ver menos/i }));
    expect(screen.queryByText("AR7")).not.toBeInTheDocument();
  });

  it("shows no expand button when there are 5 or fewer rows", () => {
    render(<LivestockStatusTable rows={buildRows(5)} locale="es" />);
    expect(screen.queryByRole("button", { name: /ver todos/i })).not.toBeInTheDocument();
  });
});
