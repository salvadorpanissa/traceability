import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SaleForm } from "@/components/activities/sale-form";

afterEach(cleanup);

vi.mock("@/app/(protected)/activities/sale/actions", () => ({
  previewSaleBatchFromPdf: vi.fn(async () => ({
    ok: true,
    guideNumber: "D963691",
    eventDate: "2026-02-01",
    originFarmId: "farm-1",
    originFarmName: "Campo Norte",
    rows: [
      {
        tag: "AR000000000300",
        eventDate: "2026-02-01",
        notes: null,
        status: "new",
        categoryId: null,
        sex: null,
        birthDate: null,
        ownerId: null,
        pendingOwnerName: null,
      },
    ],
    withdrawalWarnings: [],
  })),
  confirmSaleBatchFromPdfAction: vi.fn(async () => undefined),
  createOwnerAction: vi.fn(async (name: string) => ({ id: "o1", name })),
}));

async function uploadGuide(user: ReturnType<typeof userEvent.setup>) {
  const file = new File(["dummy"], "guia.pdf", { type: "application/pdf" });
  await user.upload(screen.getByLabelText(/archivo/i), file);
  await user.click(screen.getByRole("button", { name: /subir/i }));
}

describe("SaleForm", () => {
  it("shows the preview with origin farm and guide number, and confirms with optional buyer/price/weight", async () => {
    render(<SaleForm />);
    const user = userEvent.setup();

    await uploadGuide(user);

    await waitFor(() => expect(screen.getByText("AR000000000300")).toBeInTheDocument());
    expect(screen.getByText("D963691")).toBeInTheDocument();
    expect(screen.getByText("Campo Norte")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/comprador/i), "Cledinor S.A.");
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    const { confirmSaleBatchFromPdfAction } = await import("@/app/(protected)/activities/sale/actions");
    await waitFor(() => expect(confirmSaleBatchFromPdfAction).toHaveBeenCalled());
  });

  it("surfaces a rejected confirm as an error message and leaves Confirmar usable again", async () => {
    const { confirmSaleBatchFromPdfAction } = await import("@/app/(protected)/activities/sale/actions");
    vi.mocked(confirmSaleBatchFromPdfAction).mockRejectedValueOnce(
      new Error("La caravana AR000000000300 figura en otro campo; no se puede vender desde acá")
    );

    render(<SaleForm />);
    const user = userEvent.setup();

    await uploadGuide(user);
    await waitFor(() => expect(screen.getByText("AR000000000300")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    await waitFor(() => expect(screen.getByText(/figura en otro campo/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /confirmar/i })).not.toBeDisabled();
    expect(screen.queryByText("Venta confirmada.")).not.toBeInTheDocument();
  });

  it("shows a withdrawal warning with a per-caravana checkbox, and blocks Confirmar until it's forced", async () => {
    const { previewSaleBatchFromPdf } = await import("@/app/(protected)/activities/sale/actions");
    vi.mocked(previewSaleBatchFromPdf).mockResolvedValueOnce({
      ok: true,
      guideNumber: "D963692",
      eventDate: "2026-02-10",
      originFarmId: "farm-1",
      originFarmName: "Campo Norte",
      rows: [
        {
          tag: "AR000000000301",
          eventDate: "2026-02-10",
          notes: null,
          status: "existing",
          animalId: "animal-1",
          currentFarmId: "farm-1",
          currentPaddockId: null,
        },
      ],
      withdrawalWarnings: [
        { tag: "AR000000000301", productName: "Ivermectina 1%", restrictionEndDate: "2026-02-22" },
      ],
    });

    render(<SaleForm />);
    const user = userEvent.setup();

    await uploadGuide(user);

    // The tag legitimately appears twice once the preview loads: once in the
    // withdrawal-warning table and once in the row-status table below it
    // (TransferPreviewTable renders every row regardless of warnings) — so
    // this asserts on the count rather than a single unique match.
    await waitFor(() => expect(screen.getAllByText("AR000000000301")).toHaveLength(2));
    expect(screen.getByText(/Ivermectina 1%/)).toBeInTheDocument();
    expect(screen.getByText(/2026-02-22/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirmar/i })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: /vender igual/i }));
    expect(screen.getByRole("button", { name: /confirmar/i })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    const { confirmSaleBatchFromPdfAction } = await import("@/app/(protected)/activities/sale/actions");
    await waitFor(() => {
      const call = vi.mocked(confirmSaleBatchFromPdfAction).mock.calls.at(-1)?.[0] as FormData;
      expect(JSON.parse(call.get("forcedWithdrawalTags") as string)).toEqual(["AR000000000301"]);
    });
  });
});
