import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ColumnMapper } from "@/components/activities/column-mapper";

// This project's vitest config doesn't enable `globals`, so
// @testing-library/react's automatic afterEach cleanup never registers —
// see __tests__/components/dashboard/livestock-status-table.test.tsx for
// the full explanation.
afterEach(cleanup);

describe("ColumnMapper", () => {
  it("only offers the default four meanings when availableMeanings is not passed", () => {
    render(<ColumnMapper headers={["IDE"]} onSubmit={vi.fn()} />);
    expect(screen.queryByRole("option", { name: "Producto" })).not.toBeInTheDocument();
  });

  it("offers Producto when availableMeanings includes it, and allows it on more than one column", async () => {
    const onSubmit = vi.fn();
    render(
      <ColumnMapper
        headers={["IDE", "SANIDAD", "SANIDAD 2"]}
        availableMeanings={["tag", "date", "category", "product", "ignore"]}
        onSubmit={onSubmit}
      />
    );
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("IDE"), "tag");
    await user.selectOptions(screen.getByLabelText("SANIDAD"), "product");
    await user.selectOptions(screen.getByLabelText("SANIDAD 2"), "product");
    await user.click(screen.getByRole("button", { name: /continuar/i }));

    expect(onSubmit).toHaveBeenCalledWith([
      { header: "IDE", meaning: "tag" },
      { header: "SANIDAD", meaning: "product" },
      { header: "SANIDAD 2", meaning: "product" },
    ]);
  });

  it("pre-fills from initialMapping instead of defaulting every column to ignore", () => {
    render(
      <ColumnMapper
        headers={["IDE", "Fecha"]}
        initialMapping={[
          { header: "IDE", meaning: "tag" },
          { header: "Fecha", meaning: "ignore" },
        ]}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByLabelText("IDE")).toHaveValue("tag");
    expect(screen.getByLabelText("Fecha")).toHaveValue("ignore");
  });

  it("offers Sexo and Propietario when availableMeanings includes them", () => {
    render(
      <ColumnMapper
        headers={["SEXO", "PROPIETARIO"]}
        availableMeanings={["tag", "date", "category", "sex", "owner", "ignore"]}
        onSubmit={vi.fn()}
      />
    );
    expect(screen.getAllByRole("option", { name: "Sexo" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("option", { name: "Propietario" }).length).toBeGreaterThan(0);
  });
});
