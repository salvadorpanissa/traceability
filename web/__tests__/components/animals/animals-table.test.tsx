import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnimalsTable } from "@/components/animals/animals-table";
import type { AnimalLookupDetail } from "@/lib/dal/animal-access";
import type { OwnerCatalogEntry } from "@/lib/dal/owner-catalog";

afterEach(cleanup);

const owners: OwnerCatalogEntry[] = [
  { id: "o1", name: "SASG" },
  { id: "o2", name: "AIP" },
];

const categoriesByEstablishmentId = {};

function makeAnimal(overrides: Partial<AnimalLookupDetail>): AnimalLookupDetail {
  return {
    animalId: "a1",
    currentTag: "AR1",
    currentEstablishmentId: null,
    establishmentName: "Campo Norte",
    currentPaddockId: null,
    paddockName: "Potrero 1",
    currentCategoryId: null,
    categoryName: "Vaca",
    status: "alive",
    sex: "female",
    breed: "Hereford",
    birthDate: "2021-01-01",
    ownerName: "SASG",
    secondaryTag: null,
    notes: null,
    reproductiveStatusId: null,
    reproductiveStatusName: null,
    ...overrides,
  };
}

describe("AnimalsTable", () => {
  it("shows every visible animal, alive and not, with its status", () => {
    const rows = [
      makeAnimal({ animalId: "a1", currentTag: "AR1", status: "alive" }),
      makeAnimal({ animalId: "a2", currentTag: "AR2", status: "sold" }),
      makeAnimal({ animalId: "a3", currentTag: "AR3", status: "dead" }),
    ];

    render(
      <AnimalsTable rows={rows} owners={owners} categoriesByEstablishmentId={categoriesByEstablishmentId} reproductiveStatusesByEstablishmentId={{}} locale="es" />
    );
    const table = within(screen.getByRole("table"));

    expect(table.getByText("AR1")).toBeInTheDocument();
    expect(table.getByText("AR2")).toBeInTheDocument();
    expect(table.getByText("AR3")).toBeInTheDocument();
    expect(table.getByText("Viva")).toBeInTheDocument();
    expect(table.getByText("Vendida")).toBeInTheDocument();
    expect(table.getByText("Muerta")).toBeInTheDocument();
  });

  it("searches by tag and by owner, matching what the placeholder promises", async () => {
    const rows = [
      makeAnimal({ animalId: "a1", currentTag: "AR1", ownerName: "SASG" }),
      makeAnimal({ animalId: "a2", currentTag: "AR2", ownerName: "AIP" }),
    ];

    render(
      <AnimalsTable rows={rows} owners={owners} categoriesByEstablishmentId={categoriesByEstablishmentId} reproductiveStatusesByEstablishmentId={{}} locale="es" />
    );
    const user = userEvent.setup();
    const search = screen.getByPlaceholderText(/buscar por caravana/i);

    await user.type(search, "AR2");
    expect(screen.queryByText("AR1")).not.toBeInTheDocument();
    expect(screen.getByText("AR2")).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "SASG");
    expect(screen.getByText("AR1")).toBeInTheDocument();
    expect(screen.queryByText("AR2")).not.toBeInTheDocument();
  });

  it("does not match category through the search box, since that has its own filter", async () => {
    const rows = [makeAnimal({ animalId: "a1", currentTag: "AR1", categoryName: "Vaca de cría" })];

    render(
      <AnimalsTable rows={rows} owners={owners} categoriesByEstablishmentId={categoriesByEstablishmentId} reproductiveStatusesByEstablishmentId={{}} locale="es" />
    );
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText(/buscar por caravana/i), "Vaca de cría");

    expect(screen.queryByText("AR1")).not.toBeInTheDocument();
  });

  it("shows an empty-state message when there are no animals", () => {
    render(
      <AnimalsTable rows={[]} owners={owners} categoriesByEstablishmentId={categoriesByEstablishmentId} reproductiveStatusesByEstablishmentId={{}} locale="es" />
    );
    expect(screen.getByText("No hay animales para mostrar.")).toBeInTheDocument();
  });

  it("narrows the list with the status dropdown filter", async () => {
    const rows = [
      makeAnimal({ animalId: "a1", currentTag: "AR1", status: "alive" }),
      makeAnimal({ animalId: "a2", currentTag: "AR2", status: "sold" }),
    ];

    render(
      <AnimalsTable rows={rows} owners={owners} categoriesByEstablishmentId={categoriesByEstablishmentId} reproductiveStatusesByEstablishmentId={{}} locale="es" />
    );
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("Estado"), "Vendida");

    expect(screen.queryByText("AR1")).not.toBeInTheDocument();
    expect(screen.getByText("AR2")).toBeInTheDocument();
  });

  it("narrows the potrero filter's options to the selected campo's potreros", async () => {
    const rows = [
      makeAnimal({ animalId: "a1", currentTag: "AR1", establishmentName: "Campo Norte", paddockName: "Potrero 1" }),
      makeAnimal({ animalId: "a2", currentTag: "AR2", establishmentName: "Campo Norte", paddockName: "Potrero 2" }),
      makeAnimal({ animalId: "a3", currentTag: "AR3", establishmentName: "Campo Sur", paddockName: "Potrero 9" }),
    ];

    render(
      <AnimalsTable rows={rows} owners={owners} categoriesByEstablishmentId={categoriesByEstablishmentId} reproductiveStatusesByEstablishmentId={{}} locale="es" />
    );
    const user = userEvent.setup();

    const potreroSelect = screen.getByLabelText("Potrero") as HTMLSelectElement;
    expect(within(potreroSelect).getByText("Potrero 9")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Campo"), "Campo Norte");

    expect(within(potreroSelect).getByText("Potrero 1")).toBeInTheDocument();
    expect(within(potreroSelect).getByText("Potrero 2")).toBeInTheDocument();
    expect(within(potreroSelect).queryByText("Potrero 9")).not.toBeInTheDocument();
  });

  it("resets an already-selected potrero if it no longer belongs to the newly chosen campo", async () => {
    const rows = [
      makeAnimal({ animalId: "a1", currentTag: "AR1", establishmentName: "Campo Norte", paddockName: "Potrero 1" }),
      makeAnimal({ animalId: "a2", currentTag: "AR2", establishmentName: "Campo Sur", paddockName: "Potrero 9" }),
    ];

    render(
      <AnimalsTable rows={rows} owners={owners} categoriesByEstablishmentId={categoriesByEstablishmentId} reproductiveStatusesByEstablishmentId={{}} locale="es" />
    );
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("Potrero"), "Potrero 9");
    expect(screen.getByText("AR2")).toBeInTheDocument();
    expect(screen.queryByText("AR1")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Campo"), "Campo Norte");

    expect(screen.getByLabelText("Potrero")).toHaveValue("");
    expect(screen.getByText("AR1")).toBeInTheDocument();
  });

  it("shows notes and reproductive status columns", () => {
    const rows = [
      makeAnimal({ animalId: "a1", currentTag: "AR1", notes: "Cojera leve", reproductiveStatusName: "Preñada" }),
      makeAnimal({ animalId: "a2", currentTag: "AR2", notes: null, reproductiveStatusName: "Vacía" }),
    ];

    render(
      <AnimalsTable rows={rows} owners={owners} categoriesByEstablishmentId={categoriesByEstablishmentId} reproductiveStatusesByEstablishmentId={{}} locale="es" />
    );
    const table = within(screen.getByRole("table"));

    expect(table.getByText("Cojera leve")).toBeInTheDocument();
    expect(table.getByText("Preñada")).toBeInTheDocument();
    expect(table.getByText("Vacía")).toBeInTheDocument();
  });
});
