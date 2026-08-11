import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeathForm } from "@/components/activities/death-form";
import { lookupDeathCandidateAction, confirmDeathAction } from "@/app/(protected)/activities/death/actions";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@/app/(protected)/activities/death/actions", () => ({
  lookupDeathCandidateAction: vi.fn(),
  confirmDeathAction: vi.fn(),
}));

const ALIVE_STATE = {
  animalId: "a1",
  currentTag: "AR001",
  currentEstablishmentId: "f1",
  establishmentName: "Campo Norte",
  currentPaddockId: "p1",
  paddockName: "Potrero 1",
  currentCategoryId: "c1",
  categoryName: "Vaca",
  status: "alive",
};

describe("DeathForm", () => {
  it("looks up a caravana and shows its current location", async () => {
    vi.mocked(lookupDeathCandidateAction).mockResolvedValue(ALIVE_STATE);
    render(<DeathForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/caravana/i), "AR001");
    await user.click(screen.getByRole("button", { name: /buscar/i }));

    await waitFor(() => expect(screen.getByText(/campo norte/i)).toBeInTheDocument());
    expect(screen.getByText(/potrero 1/i)).toBeInTheDocument();
  });

  it("shows a not-found message and no form for an unknown tag", async () => {
    vi.mocked(lookupDeathCandidateAction).mockResolvedValue(null);
    render(<DeathForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/caravana/i), "AR999");
    await user.click(screen.getByRole("button", { name: /buscar/i }));

    await waitFor(() => expect(screen.getByText(/no se encontró/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /confirmar/i })).not.toBeInTheDocument();
  });

  it("blocks confirming a death for an animal already marked dead", async () => {
    vi.mocked(lookupDeathCandidateAction).mockResolvedValue({ ...ALIVE_STATE, status: "dead" });
    render(<DeathForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/caravana/i), "AR001");
    await user.click(screen.getByRole("button", { name: /buscar/i }));

    await waitFor(() => expect(screen.getByText(/ya está registrada como muerta/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /confirmar/i })).not.toBeInTheDocument();
  });

  it("confirms a death with the entered date and cause", async () => {
    vi.mocked(lookupDeathCandidateAction).mockResolvedValue(ALIVE_STATE);
    vi.mocked(confirmDeathAction).mockResolvedValue(undefined);
    render(<DeathForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/caravana/i), "AR001");
    await user.click(screen.getByRole("button", { name: /buscar/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /confirmar/i })).toBeInTheDocument());

    await user.clear(screen.getByLabelText(/fecha/i));
    await user.type(screen.getByLabelText(/fecha/i), "2026-02-10");
    await user.type(screen.getByLabelText(/causa/i), "Timpanismo");
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    await waitFor(() => expect(screen.getByText("Muerte registrada.")).toBeInTheDocument());
    expect(confirmDeathAction).toHaveBeenCalledWith({ tag: "AR001", eventDate: "2026-02-10", cause: "Timpanismo" });
  });

  it("pre-fills and auto-searches when given an initialTag", async () => {
    vi.mocked(lookupDeathCandidateAction).mockResolvedValue(ALIVE_STATE);
    render(<DeathForm initialTag="AR001" />);

    await waitFor(() => expect(lookupDeathCandidateAction).toHaveBeenCalledWith("AR001"));
    await waitFor(() => expect(screen.getByText(/campo norte/i)).toBeInTheDocument());
  });
});
