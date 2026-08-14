import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnimalEditDialog } from "@/components/animals/animal-edit-dialog";
import { updateAnimalAction } from "@/app/(protected)/animals/actions";
import type { AnimalLookupDetail } from "@/lib/dal/animal-access";
import type { OwnerCatalogEntry } from "@/lib/dal/owner-catalog";
import type { CategoryCatalogEntry } from "@/lib/dal/category-catalog";
import type { ReproductiveStatusCatalogEntry } from "@/lib/dal/reproductive-status-catalog";

afterEach(cleanup);

vi.mock("@/app/(protected)/animals/actions", () => ({
  updateAnimalAction: vi.fn(),
}));

const baseAnimal: AnimalLookupDetail = {
  animalId: "a1",
  currentTag: "AR1",
  currentEstablishmentId: "e1",
  establishmentName: "Campo Norte",
  currentPaddockId: "p1",
  paddockName: "Potrero 1",
  currentCategoryId: "c1",
  categoryName: "Vaca de cría",
  status: "alive",
  sex: "female",
  breed: "Hereford",
  birthDate: "2021-01-01",
  ownerName: "SASG",
  secondaryTag: "CHIP1",
  notes: null,
  reproductiveStatusId: null,
  reproductiveStatusName: null,
};

const owners: OwnerCatalogEntry[] = [
  { id: "o1", name: "SASG" },
  { id: "o2", name: "AIP" },
];

const categories: CategoryCatalogEntry[] = [
  { id: "c1", farmId: "f1", name: "Vaca de cría", sex: "female", minAgeMonths: null, active: true },
  { id: "c2", farmId: "f1", name: "Vaca de invernada", sex: "female", minAgeMonths: null, active: true },
];

const reproductiveStatuses: ReproductiveStatusCatalogEntry[] = [
  { id: "rs1", farmId: "f1", name: "Preñada", active: true },
  { id: "rs2", farmId: "f1", name: "Vacía", active: true },
];

describe("AnimalEditDialog", () => {
  it("opens pre-filled with the animal's current data and saves the edited fields", async () => {
    vi.mocked(updateAnimalAction).mockResolvedValue({
      ok: true,
      animal: { ...baseAnimal, breed: "Angus", ownerName: "AIP" },
    });
    const onSaved = vi.fn();
    const user = userEvent.setup();

    render(<AnimalEditDialog animal={baseAnimal} owners={owners} categories={categories} reproductiveStatuses={reproductiveStatuses} locale="es" onSaved={onSaved} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText("Raza")).toHaveValue("Hereford");
    expect(screen.getByLabelText("Chip secundario")).toHaveValue("CHIP1");
    expect(screen.getByLabelText("Propietario")).toHaveValue("o1");
    expect(screen.getByLabelText("Categoría")).toHaveValue("c1");

    await user.clear(screen.getByLabelText("Raza"));
    await user.type(screen.getByLabelText("Raza"), "Angus");
    await user.selectOptions(screen.getByLabelText("Propietario"), "o2");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(updateAnimalAction).toHaveBeenCalledWith({
        animalId: "a1",
        categoryId: "c1",
        sex: "female",
        breed: "Angus",
        birthDate: "2021-01-01",
        ownerId: "o2",
        secondaryTag: "CHIP1",
        reproductiveStatusId: null,
      })
    );
    expect(onSaved).toHaveBeenCalledWith({ ...baseAnimal, breed: "Angus", ownerName: "AIP" });
  });

  it("shows the server error and keeps the dialog open when saving fails", async () => {
    vi.mocked(updateAnimalAction).mockResolvedValue({
      ok: false,
      error: "Ese chip secundario ya pertenece a otro animal",
    });
    const user = userEvent.setup();

    render(<AnimalEditDialog animal={baseAnimal} owners={owners} categories={categories} reproductiveStatuses={reproductiveStatuses} locale="es" onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(screen.getByText("Ese chip secundario ya pertenece a otro animal")).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });

  it("does not offer the caravana, campo, potrero, or sexo as editable fields", async () => {
    const user = userEvent.setup();
    render(<AnimalEditDialog animal={baseAnimal} owners={owners} categories={categories} reproductiveStatuses={reproductiveStatuses} locale="es" onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.queryByLabelText("Caravana")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Campo")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Potrero")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Sexo")).not.toBeInTheDocument();
  });

  it("shows the sex read-only and keeps sending it unchanged when saving", async () => {
    vi.mocked(updateAnimalAction).mockResolvedValue({ ok: true, animal: baseAnimal });
    const user = userEvent.setup();

    render(<AnimalEditDialog animal={baseAnimal} owners={owners} categories={categories} reproductiveStatuses={reproductiveStatuses} locale="es" onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByText("Hembra")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(updateAnimalAction).toHaveBeenCalledWith(expect.objectContaining({ sex: "female" })));
  });

  it("shows the campo and potrero together under one Establecimiento label", async () => {
    const user = userEvent.setup();
    render(<AnimalEditDialog animal={baseAnimal} owners={owners} categories={categories} reproductiveStatuses={reproductiveStatuses} locale="es" onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByText("Establecimiento")).toBeInTheDocument();
    expect(screen.getByText("Campo Norte, Potrero 1")).toBeInTheDocument();
  });

  it("lets the category be changed and sends the new category, warning it creates a recategorize event", async () => {
    vi.mocked(updateAnimalAction).mockResolvedValue({ ok: true, animal: { ...baseAnimal, categoryName: "Vaca de invernada" } });
    const user = userEvent.setup();

    render(<AnimalEditDialog animal={baseAnimal} owners={owners} categories={categories} reproductiveStatuses={reproductiveStatuses} locale="es" onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.queryByText("Esto genera un evento de recategorización para este animal.")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Categoría"), "c2");
    expect(screen.getByText("Esto genera un evento de recategorización para este animal.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(updateAnimalAction).toHaveBeenCalledWith(expect.objectContaining({ categoryId: "c2" }))
    );
  });

  it("lets the reproductive status be set from the catalog and sends it on save", async () => {
    vi.mocked(updateAnimalAction).mockResolvedValue({
      ok: true,
      animal: { ...baseAnimal, reproductiveStatusId: "rs1", reproductiveStatusName: "Preñada" },
    });
    const user = userEvent.setup();

    render(
      <AnimalEditDialog animal={baseAnimal} owners={owners} categories={categories} reproductiveStatuses={reproductiveStatuses} locale="es" onSaved={vi.fn()} />
    );
    await user.click(screen.getByRole("button", { name: "Editar" }));

    await user.selectOptions(screen.getByLabelText("Estado reproductivo"), "rs1");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(updateAnimalAction).toHaveBeenCalledWith(expect.objectContaining({ reproductiveStatusId: "rs1" }))
    );
  });

  it("does not show the removed campo/potrero hint", async () => {
    const user = userEvent.setup();
    render(
      <AnimalEditDialog animal={baseAnimal} owners={owners} categories={categories} reproductiveStatuses={reproductiveStatuses} locale="es" onSaved={vi.fn()} />
    );
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.queryByText(/se cambian desde Traslado/)).not.toBeInTheDocument();
  });
});
