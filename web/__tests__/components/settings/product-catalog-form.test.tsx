import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductCatalogForm } from "@/components/settings/product-catalog-form";
import { createProductAction, updateProductAction } from "@/app/(protected)/settings/products/actions";

afterEach(cleanup);

vi.mock("@/app/(protected)/settings/products/actions", () => ({
  createProductAction: vi.fn(),
  updateProductAction: vi.fn(),
}));

const farms = [{ id: "group-1", name: "Campo Norte" }];

describe("ProductCatalogForm", () => {
  it("lists products, adds a new one, and edits an existing one", async () => {
    vi.mocked(createProductAction).mockResolvedValue({
      ok: true,
      entry: {
        id: "prod-2",
        farmId: "group-1",
        name: "Aftosa",
        defaultDose: null,
        defaultDoseUnit: null,
        defaultRoute: null,
        defaultWithdrawalDays: null,
      },
    });
    vi.mocked(updateProductAction).mockResolvedValue({
      ok: true,
      entry: {
        id: "prod-1",
        farmId: "group-1",
        name: "Ivermectina 1% inyectable",
        defaultDose: "10",
        defaultDoseUnit: "cc",
        defaultRoute: "subcutánea",
        defaultWithdrawalDays: 21,
      },
    });

    render(
      <ProductCatalogForm
        products={[
          {
            id: "prod-1",
            farmId: "group-1",
            name: "Ivermectina 1%",
            defaultDose: "10",
            defaultDoseUnit: "ml",
            defaultRoute: "subcutánea",
            defaultWithdrawalDays: 21,
          },
        ]}
        farms={farms}
      />
    );

    expect(screen.getByText("Ivermectina 1%")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "+ Agregar" }));
    await userEvent.type(screen.getByLabelText("Nombre"), "Aftosa");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(screen.getByText("Aftosa")).toBeInTheDocument());
    expect(createProductAction).toHaveBeenCalledWith({
      farmId: "group-1",
      name: "Aftosa",
      defaultDose: null,
      defaultDoseUnit: null,
      defaultRoute: null,
      defaultWithdrawalDays: null,
    });

    await userEvent.click(screen.getAllByRole("button", { name: "Editar" })[0]);
    const editNameInput = screen.getByLabelText("Editar nombre");
    await userEvent.clear(editNameInput);
    await userEvent.type(editNameInput, "Ivermectina 1% inyectable");
    const editDoseUnitInput = screen.getByLabelText("Editar unidad de dosis");
    await userEvent.clear(editDoseUnitInput);
    await userEvent.type(editDoseUnitInput, "cc");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(updateProductAction).toHaveBeenCalledWith({
        id: "prod-1",
        name: "Ivermectina 1% inyectable",
        defaultDose: "10",
        defaultDoseUnit: "cc",
        defaultRoute: "subcutánea",
        defaultWithdrawalDays: 21,
      })
    );
    expect(screen.getByText("Ivermectina 1% inyectable")).toBeInTheDocument();
  });

  it("shows an inline error and keeps the form when the name is a duplicate", async () => {
    vi.mocked(createProductAction).mockResolvedValue({ ok: false, error: "Ya existe un producto con ese nombre" });

    render(<ProductCatalogForm products={[]} farms={farms} />);

    await userEvent.click(screen.getByRole("button", { name: "+ Agregar" }));
    await userEvent.type(screen.getByLabelText("Nombre"), "Aftosa");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(screen.getByText("Ya existe un producto con ese nombre")).toBeInTheDocument());
    expect(screen.queryByText("Aftosa")).not.toBeInTheDocument();
  });
});
