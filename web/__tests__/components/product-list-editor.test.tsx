import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductListEditor, emptyProduct } from "@/components/activities/product-list-editor";
import type { ProductCatalogEntry } from "@/lib/dal/product-catalog";
import type { HealthProduct } from "@/lib/activities/health";

afterEach(cleanup);

const catalog: ProductCatalogEntry[] = [
  { id: "p1", name: "Ivermectina 1%", defaultDoseUnit: "ml", defaultWithdrawalDays: 21 },
];

describe("ProductListEditor", () => {
  it("creates a product inline, pre-filling the name from the row's suggestion", async () => {
    const products: HealthProduct[] = [emptyProduct()];
    const onChange = vi.fn();
    const onCreateProduct = vi.fn(async (name: string) => ({
      id: "p2",
      name,
      defaultDoseUnit: null,
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
