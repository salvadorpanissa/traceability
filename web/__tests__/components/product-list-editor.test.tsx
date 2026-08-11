import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductListEditor, emptyProduct } from "@/components/activities/product-list-editor";
import type { ProductCatalogEntry } from "@/lib/dal/product-catalog";
import type { HealthProduct } from "@/lib/activities/health";

afterEach(cleanup);

const catalog: ProductCatalogEntry[] = [
  {
    id: "p1",
    farmId: "g1",
    name: "Ivermectina 1%",
    defaultDose: "10",
    defaultDoseUnit: "ml",
    defaultRoute: "subcutánea",
    defaultWithdrawalDays: 21,
  },
];

describe("ProductListEditor", () => {
  it("creates a product inline, pre-filling the name from the row's suggestion", async () => {
    const products: HealthProduct[] = [emptyProduct()];
    const onChange = vi.fn();
    const onCreateProduct = vi.fn(async (name: string) => ({
      id: "p2",
      farmId: "g1",
      name,
      defaultDose: null,
      defaultDoseUnit: null,
      defaultRoute: null,
      defaultWithdrawalDays: null,
    }));

    function Wrapper() {
      const [rows, setRows] = useState(products);
      return (
        <ProductListEditor
          catalog={catalog}
          products={rows}
          suggestedNames={["Aftosa"]}
          onChange={(next: HealthProduct[]) => {
            setRows(next);
            onChange(next);
          }}
          onCreateProduct={onCreateProduct}
        />
      );
    }

    render(<Wrapper />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText(/producto/i), "__create_new__");
    expect(screen.getByLabelText(/nombre del producto nuevo/i)).toHaveValue("Aftosa");

    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(onCreateProduct).toHaveBeenCalledWith("Aftosa"));
    await waitFor(() => expect(screen.getByLabelText(/producto/i)).toHaveValue("p2"));
  });

  it("pre-fills dose, unit, route, and withdrawal days when picking an existing catalog product", async () => {
    function Wrapper() {
      const [rows, setRows] = useState<HealthProduct[]>([emptyProduct()]);
      return (
        <ProductListEditor catalog={catalog} products={rows} onChange={setRows} onCreateProduct={vi.fn()} />
      );
    }

    render(<Wrapper />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText(/producto/i), "p1");

    expect(screen.getByLabelText("Dosis")).toHaveValue("10");
    expect(screen.getByLabelText(/unidad/i)).toHaveValue("ml");
    expect(screen.getByLabelText(/vía/i)).toHaveValue("subcutánea");
    expect(screen.getByLabelText(/carencia/i)).toHaveValue(21);
  });

  it("shows an error message if creation fails, without losing the typed name", async () => {
    const onCreateProduct = vi.fn(async () => {
      throw new Error("El nombre ya existe");
    });

    render(
      <ProductListEditor
        catalog={catalog}
        products={[emptyProduct()]}
        onChange={vi.fn()}
        onCreateProduct={onCreateProduct}
      />
    );
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText(/producto/i), "__create_new__");
    await user.type(screen.getByLabelText(/nombre del producto nuevo/i), "Aftosa");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(screen.getByText("El nombre ya existe")).toBeInTheDocument());
    expect(screen.getByLabelText(/nombre del producto nuevo/i)).toHaveValue("Aftosa");
  });
});
