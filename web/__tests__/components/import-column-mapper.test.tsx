import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { ImportColumnMapper } from "@/components/settings/import-column-mapper";

// This project's vitest config doesn't enable `globals`, so
// @testing-library/react's automatic afterEach cleanup never registers —
// see __tests__/components/dashboard/livestock-status-table.test.tsx for
// the full explanation.
afterEach(cleanup);

describe("ImportColumnMapper", () => {
  it("pre-selects the auto-detected meaning for each known header", () => {
    render(<ImportColumnMapper headers={["Propietario", "Estancia"]} onSubmit={vi.fn()} />);

    expect(screen.getByLabelText("Propietario")).toHaveValue("owner");
    expect(screen.getByLabelText("Estancia")).toHaveValue("establishment");
  });

  it("disables the continue button until exactly one column is mapped to tag", () => {
    render(<ImportColumnMapper headers={["Propietario"]} onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
  });

  it("calls onSubmit with the current mapping when a tag column is set", () => {
    const onSubmit = vi.fn();
    render(<ImportColumnMapper headers={["IDE (caravana electrónica)", "Propietario"]} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(onSubmit).toHaveBeenCalledWith([
      { header: "IDE (caravana electrónica)", meaning: "tag" },
      { header: "Propietario", meaning: "owner" },
    ]);
  });
});
