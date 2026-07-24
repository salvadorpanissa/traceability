import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaddockCatalogForm } from "@/components/settings/paddock-catalog-form";
import { createPaddockAction, updatePaddockAction } from "@/app/(protected)/settings/paddocks/actions";

afterEach(cleanup);

vi.mock("@/app/(protected)/settings/paddocks/actions", () => ({
  createPaddockAction: vi.fn(),
  updatePaddockAction: vi.fn(),
}));

describe("PaddockCatalogForm", () => {
  it("lists paddocks with their farm, adds a new one, and edits an existing one", async () => {
    vi.mocked(createPaddockAction).mockResolvedValue({
      ok: true,
      entry: { id: "pad-2", name: "Potrero 2", farmId: "farm-1" },
    });
    vi.mocked(updatePaddockAction).mockResolvedValue({
      ok: true,
      entry: { id: "pad-1", name: "Potrero 1 (bajo)", farmId: "farm-1" },
    });

    render(
      <PaddockCatalogForm
        paddocks={[{ id: "pad-1", name: "Potrero 1", farmId: "farm-1" }]}
        farms={[{ id: "farm-1", name: "Campo Norte" }]}
      />
    );

    const table = screen.getByRole("table");
    expect(within(table).getByText("Potrero 1")).toBeInTheDocument();
    expect(within(table).getByText("Campo Norte")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Campo"), "farm-1");
    await userEvent.type(screen.getByLabelText("Nombre"), "Potrero 2");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(screen.getByText("Potrero 2")).toBeInTheDocument());
    expect(createPaddockAction).toHaveBeenCalledWith({ farmId: "farm-1", name: "Potrero 2" });

    await userEvent.click(screen.getAllByRole("button", { name: "Editar" })[0]);
    const editNameInput = screen.getByLabelText("Editar nombre");
    await userEvent.clear(editNameInput);
    await userEvent.type(editNameInput, "Potrero 1 (bajo)");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(updatePaddockAction).toHaveBeenCalledWith({ id: "pad-1", name: "Potrero 1 (bajo)" }));
    expect(screen.getByText("Potrero 1 (bajo)")).toBeInTheDocument();
  });

  it("preselects the farm and disables the add button when the user has none", async () => {
    render(<PaddockCatalogForm paddocks={[]} farms={[]} />);

    expect(screen.getByText("No tenés campos asociados")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar" })).toBeDisabled();
  });

  it("shows an inline error when the name is a duplicate within the farm", async () => {
    vi.mocked(createPaddockAction).mockResolvedValue({
      ok: false,
      error: "Ya existe un potrero con ese nombre en ese campo",
    });

    render(<PaddockCatalogForm paddocks={[]} farms={[{ id: "farm-1", name: "Campo Norte" }]} />);

    await userEvent.type(screen.getByLabelText("Nombre"), "Potrero 1");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() =>
      expect(screen.getByText("Ya existe un potrero con ese nombre en ese campo")).toBeInTheDocument()
    );
  });
});
