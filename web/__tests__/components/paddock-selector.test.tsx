import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaddockSelector } from "@/components/activities/paddock-selector";
import type { PaddockCatalogEntry } from "@/lib/dal/paddock-catalog";

afterEach(cleanup);

const paddocks: PaddockCatalogEntry[] = [{ id: "p1", name: "Potrero 1", farmId: "farm-1" }];

describe("PaddockSelector", () => {
  it("defaults to 'Sin potrero' and lists the given paddocks", () => {
    render(<PaddockSelector paddocks={paddocks} paddockId={null} onChange={vi.fn()} onCreatePaddock={vi.fn()} />);
    expect(screen.getByLabelText(/potrero destino/i)).toHaveValue("");
    expect(screen.getByRole("option", { name: "Potrero 1" })).toBeInTheDocument();
  });

  it("selects an existing paddock", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PaddockSelector paddocks={paddocks} paddockId={null} onChange={onChange} onCreatePaddock={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText(/potrero destino/i), "p1");
    expect(onChange).toHaveBeenCalledWith("p1");
  });

  it("creates a new paddock inline and selects it", async () => {
    const onChange = vi.fn();
    const onCreatePaddock = vi.fn(async (name: string) => ({ id: "p2", name, farmId: "farm-1" }));
    const user = userEvent.setup();

    render(
      <PaddockSelector paddocks={paddocks} paddockId={null} onChange={onChange} onCreatePaddock={onCreatePaddock} />
    );

    await user.selectOptions(screen.getByLabelText(/potrero destino/i), "__create_new__");
    await user.type(screen.getByLabelText(/nombre del potrero nuevo/i), "Potrero 3");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(onCreatePaddock).toHaveBeenCalledWith("Potrero 3"));
    expect(onChange).toHaveBeenCalledWith("p2");
  });

  it("shows an error if creation fails, without losing the typed name", async () => {
    const onCreatePaddock = vi.fn(async () => {
      throw new Error("El nombre ya existe en este campo");
    });
    const user = userEvent.setup();

    render(
      <PaddockSelector paddocks={paddocks} paddockId={null} onChange={vi.fn()} onCreatePaddock={onCreatePaddock} />
    );

    await user.selectOptions(screen.getByLabelText(/potrero destino/i), "__create_new__");
    await user.type(screen.getByLabelText(/nombre del potrero nuevo/i), "Potrero 1");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(screen.getByText("El nombre ya existe en este campo")).toBeInTheDocument());
    expect(screen.getByLabelText(/nombre del potrero nuevo/i)).toHaveValue("Potrero 1");
  });
});
