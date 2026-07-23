import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransferPreviewTable } from "@/components/activities/transfer-preview-table";
import type { ResolvedRow } from "@/lib/activities/transfer";

afterEach(cleanup);

describe("TransferPreviewTable", () => {
  it("shows the error reason for an error row", () => {
    const rows: ResolvedRow[] = [
      { tag: "AR1", eventDate: "2026-02-01", notes: null, status: "error", reason: "Falta la caravana" },
    ];
    render(<TransferPreviewTable rows={rows} onToggleForced={vi.fn()} />);
    expect(screen.getByText("Falta la caravana")).toBeInTheDocument();
  });

  it("shows a pending-owner detail for a new row with an unmatched owner name", () => {
    const rows: ResolvedRow[] = [
      {
        tag: "AR2",
        eventDate: "2026-02-01",
        notes: null,
        status: "new",
        categoryId: null,
        sex: null,
        birthDate: null,
        ownerId: null,
        pendingOwnerName: "Gómez",
      },
    ];
    render(<TransferPreviewTable rows={rows} onToggleForced={vi.fn()} />);
    expect(screen.getByText("Propietario pendiente: Gómez")).toBeInTheDocument();
  });

  it("labels a foreign row and lets the user force it via checkbox", async () => {
    const onToggleForced = vi.fn();
    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000050",
        eventDate: "2026-02-01",
        notes: null,
        status: "foreign",
        forced: false,
        categoryId: null,
        sex: null,
        birthDate: null,
        ownerId: null,
        pendingOwnerName: null,
      },
    ];

    render(<TransferPreviewTable rows={rows} onToggleForced={onToggleForced} />);

    expect(screen.getByText("Ajena")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Es mía de todos modos"));
    expect(onToggleForced).toHaveBeenCalledWith("AR000000000050");
  });

  it("labels a wrong_farm row with its registered farm, and shows no checkbox", () => {
    const rows: ResolvedRow[] = [
      {
        tag: "AR000000000051",
        eventDate: "2026-02-01",
        notes: null,
        status: "wrong_farm",
        categoryId: null,
        sex: null,
        birthDate: null,
        ownerId: "owner-1",
        registeredFarmId: "farm-1",
        registeredFarmName: "Cuatro Cerros",
      },
    ];

    render(<TransferPreviewTable rows={rows} onToggleForced={vi.fn()} />);

    expect(screen.getByText("Campo incorrecto")).toBeInTheDocument();
    expect(screen.getByText(/Registrada en Cuatro Cerros/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
