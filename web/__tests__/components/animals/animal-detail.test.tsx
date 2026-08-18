import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnimalDetail } from "@/components/animals/animal-detail";
import { Toaster } from "@/components/ui/toast";
import { updateAnimalAction } from "@/app/(protected)/animals/actions";
import type { AnimalLookupDetail, AnimalTagHistoryEntry, AnimalHealthNoteEntry } from "@/lib/dal/animal-access";
import type { OwnerCatalogEntry } from "@/lib/dal/owner-catalog";
import type { CategoryCatalogEntry } from "@/lib/dal/category-catalog";
import type { ReproductiveStatusCatalogEntry } from "@/lib/dal/reproductive-status-catalog";

afterEach(cleanup);

vi.mock("@/app/(protected)/animals/actions", () => ({
  updateAnimalAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/(protected)/activities/retag/actions", () => ({
  lookupRetagCandidateAction: vi.fn().mockResolvedValue({
    status: "alive",
    establishmentName: "Campo Norte",
    paddockName: "Potrero 1",
    categoryName: "Vaca de cría",
  }),
  confirmRetagAction: vi.fn(),
}));

vi.mock("@/app/(protected)/activities/death/actions", () => ({
  lookupDeathCandidateAction: vi.fn().mockResolvedValue({
    status: "alive",
    establishmentName: "Campo Norte",
    paddockName: "Potrero 1",
    categoryName: "Vaca de cría",
  }),
  confirmDeathAction: vi.fn(),
}));

const baseAnimal: AnimalLookupDetail = {
  animalId: "a1",
  currentTag: "AR1",
  currentEstablishmentId: "e1",
  establishmentName: "Campo Norte",
  currentPaddockId: "p1",
  paddockName: "Potrero 1",
  currentCategoryId: "c1",
  categoryName: "Vaca de cría",
  status: "alive",
  sex: "female",
  breed: "Hereford",
  birthDate: "2021-01-01",
  ownerName: "SASG",
  secondaryTag: "CHIP1",
  notes: null,
  reproductiveStatusId: null,
  reproductiveStatusName: null,
};

const owners: OwnerCatalogEntry[] = [
  { id: "o1", name: "SASG", farmId: "f1" },
  { id: "o2", name: "AIP", farmId: "f1" },
];

const categories: CategoryCatalogEntry[] = [
  { id: "c1", farmId: "f1", name: "Vaca de cría", sex: "female", minAgeMonths: null, active: true },
];

const reproductiveStatuses: ReproductiveStatusCatalogEntry[] = [
  { id: "rs1", farmId: "f1", name: "Preñada", active: true },
  { id: "rs2", farmId: "f1", name: "Vacía", active: true },
];

const tagHistory: AnimalTagHistoryEntry[] = [
  { tag: "AR1", secondaryTag: "CHIP1", validFrom: new Date("2026-02-01T00:00:00Z") },
  { tag: "AR0", secondaryTag: null, validFrom: new Date("2026-01-01T00:00:00Z") },
];

const healthNotes: AnimalHealthNoteEntry[] = [];

describe("AnimalDetail", () => {
  it("shows a back link above the card", () => {
    const { container } = render(
      <AnimalDetail animal={baseAnimal} tagHistory={tagHistory} healthNotes={healthNotes} owners={owners} categories={categories} reproductiveStatuses={reproductiveStatuses} locale="es" />
    );

    const backLink = screen.getByRole("link", { name: /volver a animales/i });
    expect(backLink).toHaveAttribute("href", "/animals");
    const card = container.querySelector('[data-slot="card"]');
    expect(backLink.compareDocumentPosition(card as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("wraps the edit form and the summary card in a centered row, not the full page width", () => {
    const { container } = render(
      <AnimalDetail animal={baseAnimal} tagHistory={tagHistory} healthNotes={healthNotes} owners={owners} categories={categories} reproductiveStatuses={reproductiveStatuses} locale="es" />
    );

    const cards = container.querySelectorAll('[data-slot="card"]');
    const editCard = Array.from(cards).find((card) => card.contains(screen.getByLabelText("Raza")));
    expect(editCard).not.toBeUndefined();
    const row = editCard?.parentElement?.parentElement;
    expect(row?.className).toMatch(/max-w/);
    expect(row?.className).toMatch(/mx-auto/);
  });

  it("shows the caravana in the summary card, laid out like the other read-only fields", () => {
    const { container } = render(
      <AnimalDetail animal={baseAnimal} tagHistory={tagHistory} healthNotes={healthNotes} owners={owners} categories={categories} reproductiveStatuses={reproductiveStatuses} locale="es" />
    );

    const card = container.querySelector('[data-slot="card"]');
    const scoped = within(card as HTMLElement);
    const tagLabel = scoped.getByText("Caravana");
    const tagValue = scoped.getByText("AR1");
    expect(tagLabel.className).not.toMatch(/text-2xl|text-3xl|text-xl/);
    expect(tagLabel.nextElementSibling).toBe(tagValue);
  });

  it("shows the fields pre-filled and saves the edited ones", async () => {
    vi.mocked(updateAnimalAction).mockResolvedValue({
      ok: true,
      animal: { ...baseAnimal, breed: "Angus" },
    });
    const user = userEvent.setup();

    render(<AnimalDetail animal={baseAnimal} tagHistory={tagHistory} healthNotes={healthNotes} owners={owners} categories={categories} reproductiveStatuses={reproductiveStatuses} locale="es" />);

    expect(screen.getByLabelText("Raza")).toHaveValue("Hereford");

    await user.clear(screen.getByLabelText("Raza"));
    await user.type(screen.getByLabelText("Raza"), "Angus");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    const confirmButtons = await screen.findAllByRole("button", { name: "Guardar" });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() =>
      expect(updateAnimalAction).toHaveBeenCalledWith(
        expect.objectContaining({ animalId: "a1", breed: "Angus" })
      )
    );
  });

  it("shows the server error when saving fails", async () => {
    vi.mocked(updateAnimalAction).mockResolvedValue({
      ok: false,
      error: "Ese chip secundario ya pertenece a otro animal",
    });
    const user = userEvent.setup();

    render(
      <>
        <AnimalDetail animal={baseAnimal} tagHistory={tagHistory} healthNotes={healthNotes} owners={owners} categories={categories} reproductiveStatuses={reproductiveStatuses} locale="es" />
        <Toaster />
      </>
    );
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    const confirmButtons = await screen.findAllByRole("button", { name: "Guardar" });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(screen.getByText("Ese chip secundario ya pertenece a otro animal")).toBeInTheDocument());
  });

  it("does not offer the caravana, campo, or potrero as editable fields, but does offer sexo", () => {
    render(<AnimalDetail animal={baseAnimal} tagHistory={tagHistory} healthNotes={healthNotes} owners={owners} categories={categories} reproductiveStatuses={reproductiveStatuses} locale="es" />);

    expect(screen.queryByLabelText("Caravana")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Campo")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Potrero")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Sexo")).toHaveValue("female");
  });

  it("does not offer the propietario as an editable field", () => {
    render(<AnimalDetail animal={baseAnimal} tagHistory={tagHistory} healthNotes={healthNotes} owners={owners} categories={categories} reproductiveStatuses={reproductiveStatuses} locale="es" />);

    expect(screen.queryByLabelText("Propietario")).not.toBeInTheDocument();
    expect(screen.getByText("SASG")).toBeInTheDocument();
  });

  it("lists every past tag in a compact history table inside the activity card", () => {
    const { container } = render(
      <AnimalDetail animal={baseAnimal} tagHistory={tagHistory} healthNotes={healthNotes} owners={owners} categories={categories} reproductiveStatuses={reproductiveStatuses} locale="es" />
    );
    const table = within(screen.getByTestId("tag-history-table"));
    const cards = container.querySelectorAll('[data-slot="card"]');
    const activityCard = Array.from(cards).find((card) => card.contains(screen.getByTestId("tag-history-table")));

    expect(activityCard).not.toBeUndefined();
    expect(table.getByText("AR1")).toBeInTheDocument();
    expect(table.getByText("AR0")).toBeInTheDocument();
    expect(table.getByText("1 feb. 2026")).toBeInTheDocument();
    expect(table.getByText("1 ene. 2026")).toBeInTheDocument();
  });

  it("hides the tag history table when the animal was never retagged, but keeps the recaravanear/muerte buttons", () => {
    render(
      <AnimalDetail
        animal={baseAnimal}
        tagHistory={[tagHistory[0]]}
        healthNotes={healthNotes}
        owners={owners}
        categories={categories}
        reproductiveStatuses={reproductiveStatuses}
        locale="es"
      />
    );

    expect(screen.queryByTestId("tag-history-table")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recaravanear" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar muerte" })).toBeInTheDocument();
  });

  it("opens recaravaneo and registrar muerte modals for a living animal, next to the Guardar button in the edit card", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AnimalDetail animal={baseAnimal} tagHistory={tagHistory} healthNotes={healthNotes} owners={owners} categories={categories} reproductiveStatuses={reproductiveStatuses} locale="es" />
    );
    const saveButton = screen.getByRole("button", { name: "Guardar" });
    const retagButton = screen.getByRole("button", { name: "Recaravanear" });
    screen.getByRole("button", { name: "Registrar muerte" });
    const cards = container.querySelectorAll('[data-slot="card"]');
    const editCard = Array.from(cards).find((card) => card.contains(saveButton));

    expect(editCard).toContainElement(retagButton);

    await user.click(retagButton);
    expect(screen.queryByLabelText("Caravana actual")).not.toBeInTheDocument();
    expect(await screen.findByLabelText("Caravana nueva")).toBeInTheDocument();
  });

  it("hides the recaravaneo and muerte buttons for an animal that's already dead", () => {
    render(
      <AnimalDetail
        animal={{ ...baseAnimal, status: "dead" }}
        tagHistory={tagHistory}
        healthNotes={healthNotes}
        owners={owners}
        categories={categories}
        reproductiveStatuses={reproductiveStatuses}
        locale="es"
      />
    );

    expect(screen.queryByRole("button", { name: "Recaravanear" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar muerte" })).not.toBeInTheDocument();
  });

  it("shows each sanidad note below the card, with its date, potrero, and product", () => {
    const notes: AnimalHealthNoteEntry[] = [
      {
        eventDate: "2026-02-01",
        establishmentName: "Campo Norte",
        paddockName: "Potrero 2",
        productName: "Ivermectina 1%",
        withdrawalEndDate: "2026-02-08",
        notes: "Tratamiento aplicado",
      },
      {
        eventDate: "2026-01-01",
        establishmentName: "Cuatro Cerros",
        paddockName: "Potrero 1",
        productName: "ANTIBIOTICO PLUS",
        withdrawalEndDate: null,
        notes: "Cojera leve",
      },
    ];
    const { container } = render(
      <AnimalDetail animal={baseAnimal} tagHistory={tagHistory} healthNotes={notes} owners={owners} categories={categories} reproductiveStatuses={reproductiveStatuses} locale="es" />
    );
    const card = container.querySelector('[data-slot="card"]');
    const section = screen.getByTestId("animal-health-notes");

    expect(card).not.toContainElement(section);
    expect((card as Node).compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const table = within(section);
    expect(table.getByText("1 feb. 2026")).toBeInTheDocument();
    expect(table.getByText("Campo Norte, Potrero 2")).toBeInTheDocument();
    expect(table.getByText("Ivermectina 1%")).toBeInTheDocument();
    expect(table.getByText("8 feb. 2026")).toBeInTheDocument();
    expect(table.getByText("Tratamiento aplicado")).toBeInTheDocument();
    expect(table.getByText("1 ene. 2026")).toBeInTheDocument();
    expect(table.getByText("Cuatro Cerros, Potrero 1")).toBeInTheDocument();
    expect(table.getByText("Antibiotico plus")).toBeInTheDocument();
    expect(table.getByText("Cojera leve")).toBeInTheDocument();
    expect(table.getByText("—")).toBeInTheDocument();

    const headers = table.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Producto", "Lugar", "Fecha", "Retiro hasta", "Notas"]);
  });

  it("shows a fallback when there are no sanidad notes", () => {
    render(<AnimalDetail animal={baseAnimal} tagHistory={tagHistory} healthNotes={healthNotes} owners={owners} categories={categories} reproductiveStatuses={reproductiveStatuses} locale="es" />);

    expect(screen.getByText("Sanidades realizadas")).toBeInTheDocument();
    expect(screen.getByText("Sin notas de sanidad.")).toBeInTheDocument();
  });
});
