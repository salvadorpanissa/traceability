import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReproductiveStatusLegend } from "@/components/activities/reproductive-status-legend";
import type { ReproductiveStatusCatalogEntry } from "@/lib/dal/reproductive-status-catalog";

afterEach(cleanup);

const catalog: ReproductiveStatusCatalogEntry[] = [
  { id: "rs1", farmId: "f1", name: "Preñada", active: true },
  { id: "rs2", farmId: "f1", name: "Vacía", active: true },
];

describe("ReproductiveStatusLegend", () => {
  it("lets each distinct raw value be assigned to a catalog status", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ReproductiveStatusLegend
        distinctValues={["1", "2"]}
        catalog={catalog}
        onCreateStatus={vi.fn()}
        onChange={onChange}
      />
    );

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Valor: 1"), "rs1");
    expect(onChange).toHaveBeenLastCalledWith({ "1": "rs1" });

    await user.selectOptions(screen.getByLabelText("Valor: 2"), "rs2");
    expect(onChange).toHaveBeenLastCalledWith({ "1": "rs1", "2": "rs2" });
  });

  it("creates a new status inline and makes it available for every value", async () => {
    const onCreateStatus = vi.fn().mockResolvedValue({ id: "rs3", farmId: "f1", name: "Repite", active: true });
    const user = userEvent.setup();

    render(
      <ReproductiveStatusLegend distinctValues={["3"]} catalog={catalog} onCreateStatus={onCreateStatus} onChange={vi.fn()} />
    );

    await user.type(screen.getByLabelText("Nombre del estado nuevo"), "Repite");
    await user.click(screen.getByRole("button", { name: "Crear estado" }));

    await waitFor(() => expect(onCreateStatus).toHaveBeenCalledWith("Repite"));
    expect(await screen.findByText("Repite")).toBeInTheDocument();
  });

  it("explicitly picking Sin dato submits the key with an empty-string value, not key absence", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ReproductiveStatusLegend distinctValues={["1"]} catalog={catalog} onCreateStatus={vi.fn()} onChange={onChange} />
    );

    expect(screen.getByLabelText("Valor: 1")).toHaveValue("");
    expect(onChange).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText("Valor: 1"), "Sin dato");
    expect(onChange).toHaveBeenLastCalledWith({ "1": "" });
  });
});
