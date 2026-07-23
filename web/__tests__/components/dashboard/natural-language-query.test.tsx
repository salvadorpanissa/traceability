import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NaturalLanguageQuery } from "@/components/dashboard/natural-language-query";
import { runNaturalLanguageQuery } from "@/app/(protected)/dashboard/query-actions";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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

  it("clears the textarea as soon as the question is submitted", async () => {
    vi.mocked(runNaturalLanguageQuery).mockResolvedValue({ status: "ok", columns: [], rows: [] });

    render(<NaturalLanguageQuery locale="es" />);
    const textarea = screen.getByPlaceholderText(/pregunt/i);
    await userEvent.type(textarea, "¿cuántos animales hay?");
    await userEvent.click(screen.getByRole("button", { name: "Consultar" }));

    expect(textarea).toHaveValue("");
  });

  it("submits on Enter without a modifier, and inserts a newline on Shift+Enter instead", async () => {
    vi.mocked(runNaturalLanguageQuery).mockResolvedValue({ status: "ok", columns: [], rows: [] });

    render(<NaturalLanguageQuery locale="es" />);
    const textarea = screen.getByPlaceholderText(/pregunt/i);
    await userEvent.type(textarea, "línea uno{Shift>}{Enter}{/Shift}línea dos");

    expect(textarea).toHaveValue("línea uno\nlínea dos");
    expect(runNaturalLanguageQuery).not.toHaveBeenCalled();

    await userEvent.type(textarea, "{Enter}");

    await waitFor(() => expect(runNaturalLanguageQuery).toHaveBeenCalledWith("línea uno\nlínea dos"));
    expect(textarea).toHaveValue("");
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
