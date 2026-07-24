import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategoryCatalogForm } from "@/components/settings/category-catalog-form";
import { createCategoryAction, updateCategoryAction } from "@/app/(protected)/settings/categories/actions";

afterEach(cleanup);

vi.mock("@/app/(protected)/settings/categories/actions", () => ({
  createCategoryAction: vi.fn(),
  updateCategoryAction: vi.fn(),
}));

describe("CategoryCatalogForm", () => {
  it("lists categories, adds a new one, and edits an existing one", async () => {
    vi.mocked(createCategoryAction).mockResolvedValue({
      ok: true,
      entry: { id: "cat-2", name: "Toro", sortOrder: 1 },
    });
    vi.mocked(updateCategoryAction).mockResolvedValue({
      ok: true,
      entry: { id: "cat-1", name: "Vaca de invernada", sortOrder: 0 },
    });

    render(<CategoryCatalogForm categories={[{ id: "cat-1", name: "Vaca", sortOrder: 0 }]} />);

    expect(screen.getByText("Vaca")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Nombre"), "Toro");
    const sortOrderInput = screen.getByLabelText("Orden");
    await userEvent.clear(sortOrderInput);
    await userEvent.type(sortOrderInput, "1");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(screen.getByText("Toro")).toBeInTheDocument());
    expect(createCategoryAction).toHaveBeenCalledWith({ name: "Toro", sortOrder: 1 });

    await userEvent.click(screen.getAllByRole("button", { name: "Editar" })[0]);
    const editNameInput = screen.getByLabelText("Editar nombre");
    await userEvent.clear(editNameInput);
    await userEvent.type(editNameInput, "Vaca de invernada");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(updateCategoryAction).toHaveBeenCalledWith({ id: "cat-1", name: "Vaca de invernada", sortOrder: 0 })
    );
    expect(screen.getByText("Vaca de invernada")).toBeInTheDocument();
  });

  it("shows an inline error when the name is a duplicate", async () => {
    vi.mocked(createCategoryAction).mockResolvedValue({ ok: false, error: "Ya existe una categoría con ese nombre" });

    render(<CategoryCatalogForm categories={[]} />);

    await userEvent.type(screen.getByLabelText("Nombre"), "Vaca");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(screen.getByText("Ya existe una categoría con ese nombre")).toBeInTheDocument());
  });
});
