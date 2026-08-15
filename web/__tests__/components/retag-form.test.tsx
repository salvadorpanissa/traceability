import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RetagForm } from "@/components/activities/retag-form";
import { lookupRetagCandidateAction, confirmRetagAction } from "@/app/(protected)/activities/retag/actions";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@/app/(protected)/activities/retag/actions", () => ({
  lookupRetagCandidateAction: vi.fn(),
  confirmRetagAction: vi.fn(),
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

describe("RetagForm", () => {
  it("looks up a caravana and shows its current location", async () => {
    vi.mocked(lookupRetagCandidateAction).mockResolvedValue(ALIVE_STATE);
    render(<RetagForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/caravana actual/i), "AR001");
    await user.click(screen.getByRole("button", { name: /buscar/i }));

    await waitFor(() => expect(screen.getByText(/campo norte/i)).toBeInTheDocument());
    expect(screen.getByText(/potrero 1/i)).toBeInTheDocument();
  });

  it("shows a not-found message and no form for an unknown tag", async () => {
    vi.mocked(lookupRetagCandidateAction).mockResolvedValue(null);
    render(<RetagForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/caravana actual/i), "AR999");
    await user.click(screen.getByRole("button", { name: /buscar/i }));

    await waitFor(() => expect(screen.getByText(/no se encontró/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /confirmar/i })).not.toBeInTheDocument();
  });

  it("blocks confirming a retag for an animal already marked dead", async () => {
    vi.mocked(lookupRetagCandidateAction).mockResolvedValue({ ...ALIVE_STATE, status: "dead" });
    render(<RetagForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/caravana actual/i), "AR001");
    await user.click(screen.getByRole("button", { name: /buscar/i }));

    await waitFor(() => expect(screen.getByText(/ya está registrada como muerta/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /confirmar/i })).not.toBeInTheDocument();
  });

  it("confirms a retag with the entered new tag and date", async () => {
    vi.mocked(lookupRetagCandidateAction).mockResolvedValue(ALIVE_STATE);
    vi.mocked(confirmRetagAction).mockResolvedValue(undefined);
    render(<RetagForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/caravana actual/i), "AR001");
    await user.click(screen.getByRole("button", { name: /buscar/i }));
    await waitFor(() => expect(screen.getByLabelText(/caravana nueva/i)).toBeInTheDocument());

    await user.clear(screen.getByLabelText(/fecha/i));
    await user.type(screen.getByLabelText(/fecha/i), "2026-02-10");
    await user.type(screen.getByLabelText(/caravana nueva/i), "AR999");
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    await waitFor(() => expect(screen.getByText("Recaravaneo registrado.")).toBeInTheDocument());
    expect(confirmRetagAction).toHaveBeenCalledWith({ tag: "AR001", newTag: "AR999", eventDate: "2026-02-10" });
  });

  it("disables Confirmar until a new tag is entered", async () => {
    vi.mocked(lookupRetagCandidateAction).mockResolvedValue(ALIVE_STATE);
    render(<RetagForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/caravana actual/i), "AR001");
    await user.click(screen.getByRole("button", { name: /buscar/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /confirmar/i })).toBeDisabled());
  });
});
