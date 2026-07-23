import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnimalLookup } from "@/components/dashboard/animal-lookup";
import { lookupAnimalByTagAction } from "@/app/(protected)/dashboard/animal-lookup-actions";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@/app/(protected)/dashboard/animal-lookup-actions", () => ({
  lookupAnimalByTagAction: vi.fn(),
}));

describe("AnimalLookup", () => {
  it("disables the submit button while the tag is empty", () => {
    render(<AnimalLookup locale="es" />);
    expect(screen.getByRole("button", { name: "Buscar" })).toBeDisabled();
  });

  it("shows the animal's location on a successful lookup", async () => {
    vi.mocked(lookupAnimalByTagAction).mockResolvedValue({
      animalId: "a1",
      currentTag: "AR001",
      currentFarmId: "f1",
      farmName: "Campo Norte",
      currentPaddockId: "p1",
      paddockName: "Potrero 1",
      currentCategoryId: "c1",
      categoryName: "Vaca",
      status: "alive",
    });

    render(<AnimalLookup locale="es" />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Número de caravana"), "AR001");
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    await waitFor(() => expect(screen.getByText(/campo/i)).toBeInTheDocument());
    expect(lookupAnimalByTagAction).toHaveBeenCalledWith("AR001");
    expect(screen.getByText(/campo norte/i)).toBeInTheDocument();
    expect(screen.getByText(/potrero 1/i)).toBeInTheDocument();
    expect(screen.getByText(/vaca/i)).toBeInTheDocument();
    expect(screen.getByText(/viva/i)).toBeInTheDocument();
  });

  it("mentions the current tag when it differs from what was searched", async () => {
    vi.mocked(lookupAnimalByTagAction).mockResolvedValue({
      animalId: "a1",
      currentTag: "AR002",
      currentFarmId: "f1",
      farmName: "Campo Norte",
      currentPaddockId: null,
      paddockName: null,
      currentCategoryId: null,
      categoryName: null,
      status: "alive",
    });

    render(<AnimalLookup locale="es" />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Número de caravana"), "AR001");
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    await waitFor(() => expect(screen.getByText(/AR002/)).toBeInTheDocument());
  });

  it("shows a not-found message when the tag doesn't resolve", async () => {
    vi.mocked(lookupAnimalByTagAction).mockResolvedValue(null);

    render(<AnimalLookup locale="es" />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Número de caravana"), "AR999");
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    await waitFor(() => expect(screen.getByText("No se encontró esa caravana.")).toBeInTheDocument());
  });

  it("submits on Enter", async () => {
    vi.mocked(lookupAnimalByTagAction).mockResolvedValue(null);

    render(<AnimalLookup locale="es" />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Número de caravana"), "AR001{Enter}");

    await waitFor(() => expect(lookupAnimalByTagAction).toHaveBeenCalledWith("AR001"));
  });
});
