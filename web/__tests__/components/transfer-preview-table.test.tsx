import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TransferPreviewTable } from "@/components/activities/transfer-preview-table";
import type { ResolvedRow } from "@/lib/activities/transfer";

afterEach(cleanup);

describe("TransferPreviewTable", () => {
  it("shows the error reason for an error row", () => {
    const rows: ResolvedRow[] = [
      { tag: "AR1", eventDate: "2026-02-01", notes: null, status: "error", reason: "Falta la caravana" },
    ];
    render(<TransferPreviewTable rows={rows} />);
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
        ownerId: null,
        pendingOwnerName: "Gómez",
      },
    ];
    render(<TransferPreviewTable rows={rows} />);
    expect(screen.getByText("Propietario pendiente: Gómez")).toBeInTheDocument();
  });
});
