import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReproductiveStatusLegend } from "@/components/activities/reproductive-status-legend";

afterEach(cleanup);

describe("ReproductiveStatusLegend", () => {
  it("lets each distinct raw value be typed a status name, with no catalog dropdown", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<ReproductiveStatusLegend distinctValues={["1", "2"]} onChange={onChange} />);

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Valor: 1"), "Preñada");
    expect(onChange).toHaveBeenLastCalledWith({ "1": "Preñada" });

    await user.type(screen.getByLabelText("Valor: 2"), "Vacía");
    expect(onChange).toHaveBeenLastCalledWith({ "1": "Preñada", "2": "Vacía" });
  });

  it("restores a previously typed name from initialNameMap", () => {
    render(
      <ReproductiveStatusLegend distinctValues={["1"]} initialNameMap={{ "1": "Preñada" }} onChange={vi.fn()} />
    );
    expect(screen.getByLabelText("Valor: 1")).toHaveValue("Preñada");
  });

  it("leaves a value blank by default, meaning sin dato", () => {
    const onChange = vi.fn();
    render(<ReproductiveStatusLegend distinctValues={["1"]} onChange={onChange} />);
    expect(screen.getByLabelText("Valor: 1")).toHaveValue("");
    expect(onChange).not.toHaveBeenCalled();
  });
});
