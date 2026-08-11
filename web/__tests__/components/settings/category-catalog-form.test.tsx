import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategoryCatalogForm } from "@/components/settings/category-catalog-form";
import {
  createCategoryAction,
  updateCategoryAction,
  archiveCategoryAction,
} from "@/app/(protected)/settings/categories/actions";

afterEach(cleanup);

vi.mock("@/app/(protected)/settings/categories/actions", () => ({
  createCategoryAction: vi.fn(),
  updateCategoryAction: vi.fn(),
  archiveCategoryAction: vi.fn(),
}));

const farms = [{ id: "group-1", name: "Campo Norte" }];

describe("CategoryCatalogForm", () => {
  it("lists categories, adds a new one, and edits an existing one", async () => {
    vi.mocked(createCategoryAction).mockResolvedValue({
      ok: true,
      entry: { id: "cat-2", farmId: "group-1", name: "Toro", sex: null, minAgeMonths: null, active: true },
    });
    vi.mocked(updateCategoryAction).mockResolvedValue({
      ok: true,
      entry: {
        id: "cat-1",
        farmId: "group-1",
        name: "Vaca de invernada",
        sex: null,
        minAgeMonths: null,
        active: true,
      },
    });

    render(
      <CategoryCatalogForm
        categories={[{ id: "cat-1", farmId: "group-1", name: "Vaca", sex: null, minAgeMonths: null, active: true }]}
        farms={farms}
      />
    );

    expect(screen.getByText("Vaca")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "+ Agregar" }));
    await userEvent.type(screen.getByLabelText("Nombre"), "Toro");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(screen.getByText("Toro")).toBeInTheDocument());
    expect(createCategoryAction).toHaveBeenCalledWith({ farmId: "group-1", name: "Toro", sex: null, minAgeMonths: null });

    await userEvent.click(screen.getAllByRole("button", { name: "Editar" })[0]);
    const editNameInput = screen.getByLabelText("Editar nombre");
    await userEvent.clear(editNameInput);
    await userEvent.type(editNameInput, "Vaca de invernada");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(updateCategoryAction).toHaveBeenCalledWith({
        id: "cat-1",
        name: "Vaca de invernada",
        sex: null,
        minAgeMonths: null,
      })
    );
    expect(screen.getByText("Vaca de invernada")).toBeInTheDocument();
  });

  it("shows an inline error when the name is a duplicate", async () => {
    vi.mocked(createCategoryAction).mockResolvedValue({ ok: false, error: "Ya existe una categoría con ese nombre" });

    render(<CategoryCatalogForm categories={[]} farms={farms} />);

    await userEvent.click(screen.getByRole("button", { name: "+ Agregar" }));
    await userEvent.type(screen.getByLabelText("Nombre"), "Vaca");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(screen.getByText("Ya existe una categoría con ese nombre")).toBeInTheDocument());
  });

  it("creates a category with a sex scope and minimum age", async () => {
    vi.mocked(createCategoryAction).mockResolvedValue({
      ok: true,
      entry: { id: "cat-2", farmId: "group-1", name: "Novillo +3 años", sex: "male", minAgeMonths: 36, active: true },
    });

    render(<CategoryCatalogForm categories={[]} farms={farms} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "+ Agregar" }));
    await user.type(screen.getByLabelText("Nombre"), "Novillo +3 años");
    await user.selectOptions(screen.getByLabelText("Sexo"), "male");
    await user.type(screen.getByLabelText("Edad mínima (meses)"), "36");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() =>
      expect(createCategoryAction).toHaveBeenCalledWith({
        farmId: "group-1",
        name: "Novillo +3 años",
        sex: "male",
        minAgeMonths: 36,
      })
    );
    expect(screen.getByText("Novillo +3 años")).toBeInTheDocument();
  });

  it("archives a category directly, with no target category asked, when it has no animals", async () => {
    vi.mocked(archiveCategoryAction).mockResolvedValue({ ok: true, reassigned: 0 });

    render(
      <CategoryCatalogForm
        categories={[{ id: "cat-1", farmId: "group-1", name: "Toro", sex: null, minAgeMonths: null, active: true }]}
        animalCounts={{}}
        farms={farms}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(screen.getByText(/No tiene animales activos/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() =>
      expect(archiveCategoryAction).toHaveBeenCalledWith({ categoryId: "cat-1", targetCategoryId: null })
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: "Eliminar" })).not.toBeInTheDocument());
    expect(screen.getByText("Categorías archivadas")).toBeInTheDocument();
    expect(screen.getByText("Toro")).toBeInTheDocument();
  });

  it("asks which category to move animals to before archiving, and blocks confirming until one is chosen", async () => {
    vi.mocked(archiveCategoryAction).mockResolvedValue({ ok: true, reassigned: 492 });

    render(
      <CategoryCatalogForm
        categories={[
          { id: "cat-1", farmId: "group-1", name: "Ternera", sex: "female", minAgeMonths: 0, active: true },
          { id: "cat-2", farmId: "group-1", name: "Vaquillona", sex: "female", minAgeMonths: null, active: true },
        ]}
        animalCounts={{ "cat-1": 492 }}
        farms={farms}
      />
    );

    await userEvent.click(screen.getAllByRole("button", { name: "Eliminar" })[0]);
    expect(screen.getByText(/Hay 492 animales en “Ternera”/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText("Pasar animales a"), "cat-2");
    expect(screen.getByRole("button", { name: "Confirmar" })).not.toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() =>
      expect(archiveCategoryAction).toHaveBeenCalledWith({ categoryId: "cat-1", targetCategoryId: "cat-2" })
    );
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Eliminar" })).toHaveLength(1));
    expect(screen.getByText("Categorías archivadas")).toBeInTheDocument();
  });

  it("shows the server's error inline and keeps the category active when archiving fails", async () => {
    vi.mocked(archiveCategoryAction).mockResolvedValue({ ok: false, error: "No se pudo archivar la categoría" });

    render(
      <CategoryCatalogForm
        categories={[{ id: "cat-1", farmId: "group-1", name: "Toro", sex: null, minAgeMonths: null, active: true }]}
        animalCounts={{}}
        farms={farms}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(screen.getByText("No se pudo archivar la categoría")).toBeInTheDocument());
    expect(screen.getAllByText("Toro")).not.toHaveLength(0);
  });
});
