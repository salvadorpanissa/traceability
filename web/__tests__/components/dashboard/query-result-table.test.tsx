import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryResultTable } from "@/components/dashboard/query-result-table";

afterEach(cleanup);

describe("QueryResultTable", () => {
  it("renders known columns with a friendly label and row values", () => {
    render(
      <QueryResultTable
        columns={["farm_name", "total"]}
        rows={[{ farm_name: "Campo Norte", total: 3 }]}
        locale="es"
      />
    );

    expect(screen.getByText("Campo")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Campo Norte")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("labels a known column in English when the locale is en", () => {
    render(<QueryResultTable columns={["current_tag"]} rows={[{ current_tag: "AR001" }]} locale="en" />);
    expect(screen.getByText("Tag")).toBeInTheDocument();
  });

  it("humanizes an unknown column (e.g. an LLM-chosen alias) instead of showing it raw", () => {
    render(<QueryResultTable columns={["cantidad_total"]} rows={[{ cantidad_total: 5 }]} locale="es" />);
    expect(screen.getByText("Cantidad Total")).toBeInTheDocument();
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
