import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnimalLookup } from "@/components/dashboard/animal-lookup";
import { lookupAnimalByTagAction } from "@/app/(protected)/dashboard/animal-lookup-actions";
import type { AnimalLookupDetail } from "@/lib/dal/animal-access";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@/app/(protected)/dashboard/animal-lookup-actions", () => ({
  lookupAnimalByTagAction: vi.fn(),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const ALIVE_STATE: AnimalLookupDetail = {
  animalId: "a1",
  currentTag: "AR001",
  currentEstablishmentId: "f1",
  establishmentName: "Campo Norte",
  currentPaddockId: "p1",
  paddockName: "Potrero 1",
  currentCategoryId: "c1",
  categoryName: "Vaca",
  status: "alive",
  sex: "female",
  breed: "Hereford",
  birthDate: "2021-01-01",
  ownerName: "SASG",
  secondaryTag: "CHIP1",
  notes: null,
  reproductiveStatusId: null,
  reproductiveStatusName: null,
  latestWeightKg: null,
};

describe("AnimalLookup", () => {
  it("disables the submit button while the tag is empty", () => {
    render(<AnimalLookup locale="es" />);
    expect(screen.getByRole("button", { name: "Buscar" })).toBeDisabled();
  });

  it("navigates to the animal's detail page on a successful lookup", async () => {
    vi.mocked(lookupAnimalByTagAction).mockResolvedValue(ALIVE_STATE);

    render(<AnimalLookup locale="es" />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Número de caravana"), "AR001");
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    expect(lookupAnimalByTagAction).toHaveBeenCalledWith("AR001");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/animals/a1"));
  });

  it("shows a not-found message when the tag doesn't resolve, without navigating", async () => {
    vi.mocked(lookupAnimalByTagAction).mockResolvedValue(null);

    render(<AnimalLookup locale="es" />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Número de caravana"), "AR999");
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    await waitFor(() => expect(screen.getByText("No se encontró esa caravana.")).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
  });

  it("submits on Enter", async () => {
    vi.mocked(lookupAnimalByTagAction).mockResolvedValue(null);

    render(<AnimalLookup locale="es" />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Número de caravana"), "AR001{Enter}");

    await waitFor(() => expect(lookupAnimalByTagAction).toHaveBeenCalledWith("AR001"));
  });
});
