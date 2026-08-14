import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReproductiveStatusCatalogForm } from "@/components/settings/reproductive-status-catalog-form";
import {
  createReproductiveStatusAction,
  updateReproductiveStatusAction,
  archiveReproductiveStatusAction,
} from "@/app/(protected)/settings/reproductive-status/actions";

afterEach(cleanup);

vi.mock("@/app/(protected)/settings/reproductive-status/actions", () => ({
  createReproductiveStatusAction: vi.fn(),
  updateReproductiveStatusAction: vi.fn(),
  archiveReproductiveStatusAction: vi.fn(),
}));

describe("ReproductiveStatusCatalogForm", () => {
  it("lists statuses, adds a new one, edits, and archives one", async () => {
    vi.mocked(createReproductiveStatusAction).mockResolvedValue({
      ok: true,
      entry: { id: "rs-2", farmId: "farm-1", name: "Repite", active: true },
    });
    vi.mocked(updateReproductiveStatusAction).mockResolvedValue({
      ok: true,
      entry: { id: "rs-1", farmId: "farm-1", name: "Preñada confirmada", active: true },
    });
    vi.mocked(archiveReproductiveStatusAction).mockResolvedValue({
      ok: true,
      entry: { id: "rs-1", farmId: "farm-1", name: "Preñada confirmada", active: false },
    });

    render(
      <ReproductiveStatusCatalogForm
        statuses={[{ id: "rs-1", farmId: "farm-1", name: "Preñada", active: true }]}
        farms={[{ id: "farm-1", name: "Campo Norte" }]}
      />
    );

    expect(screen.getByText("Preñada")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "+ Agregar" }));
    await userEvent.type(screen.getByLabelText("Nombre"), "Repite");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(screen.getByText("Repite")).toBeInTheDocument());
    expect(createReproductiveStatusAction).toHaveBeenCalledWith({ farmId: "farm-1", name: "Repite" });

    await userEvent.click(screen.getAllByRole("button", { name: "Editar" })[0]);
    const editInput = screen.getByLabelText("Editar nombre");
    await userEvent.clear(editInput);
    await userEvent.type(editInput, "Preñada confirmada");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(updateReproductiveStatusAction).toHaveBeenCalledWith({ id: "rs-1", name: "Preñada confirmada" }));
    expect(screen.getByText("Preñada confirmada")).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: "Eliminar" })[0]);
    await waitFor(() => expect(archiveReproductiveStatusAction).toHaveBeenCalledWith("rs-1"));
    // Archiving is a plain flag flip (no reassignment flow), so "Preñada
    // confirmada" moves to the read-only "Estados archivados" list rather
    // than disappearing — it should no longer have an Editar/Eliminar row.
    expect(screen.getAllByRole("button", { name: "Eliminar" })).toHaveLength(1);
    expect(screen.getByText("Estados archivados")).toBeInTheDocument();
  });
});
