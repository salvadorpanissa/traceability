import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryResultTable } from "@/components/dashboard/query-result-table";

afterEach(cleanup);

describe("QueryResultTable", () => {
  it("renders dynamic columns and row values", () => {
    render(
      <QueryResultTable
        columns={["farm_name", "total"]}
        rows={[{ farm_name: "Campo Norte", total: 3 }]}
        locale="es"
      />
    );

    expect(screen.getByText("farm_name")).toBeInTheDocument();
    expect(screen.getByText("total")).toBeInTheDocument();
    expect(screen.getByText("Campo Norte")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows a placeholder for null values", () => {
    render(<QueryResultTable columns={["notes"]} rows={[{ notes: null }]} locale="es" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows an empty-state message when there are no rows", () => {
    render(<QueryResultTable columns={[]} rows={[]} locale="es" />);
    expect(screen.getByText("Sin resultados para esta consulta.")).toBeInTheDocument();
  });
});
