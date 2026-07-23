import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NaturalLanguageQuery } from "@/components/dashboard/natural-language-query";
import { runNaturalLanguageQuery } from "@/app/(protected)/dashboard/query-actions";

afterEach(cleanup);

vi.mock("@/app/(protected)/dashboard/query-actions", () => ({
  runNaturalLanguageQuery: vi.fn(),
}));

describe("NaturalLanguageQuery", () => {
  it("submits the question and renders the resulting table", async () => {
    vi.mocked(runNaturalLanguageQuery).mockResolvedValue({
      status: "ok",
      columns: ["farm_name", "total"],
      rows: [{ farm_name: "Campo Norte", total: 3 }],
    });

    render(<NaturalLanguageQuery locale="es" />);
    await userEvent.type(screen.getByPlaceholderText(/pregunt/i), "¿cuántos animales hay?");
    await userEvent.click(screen.getByRole("button", { name: "Consultar" }));

    await waitFor(() => expect(screen.getByText("Campo Norte")).toBeInTheDocument());
    expect(runNaturalLanguageQuery).toHaveBeenCalledWith("¿cuántos animales hay?");
  });

  it("shows the generic error message when the action returns an error", async () => {
    vi.mocked(runNaturalLanguageQuery).mockResolvedValue({ status: "error", messageKey: "cantGenerate" });

    render(<NaturalLanguageQuery locale="es" />);
    await userEvent.type(screen.getByPlaceholderText(/pregunt/i), "algo raro");
    await userEvent.click(screen.getByRole("button", { name: "Consultar" }));

    await waitFor(() =>
      expect(
        screen.getByText("No pude generar una consulta a partir de tu pregunta. Probá reformularla.")
      ).toBeInTheDocument()
    );
  });

  it("disables the submit button while the question is empty", () => {
    render(<NaturalLanguageQuery locale="es" />);
    expect(screen.getByRole("button", { name: "Consultar" })).toBeDisabled();
  });
});
