import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SaleSettlementForm } from "@/components/activities/sale-settlement-form";

afterEach(cleanup);

vi.mock("@/app/(protected)/activities/sale-settlement/actions", () => ({
  previewSaleSettlement: vi.fn(async () => ({
    ok: true,
    guideNumber: "D963691",
    weighDate: "2026-07-11",
    total: "23396.21",
    weightKg: "255.52",
    pricePerKg: "5.2189",
    match: {
      farmName: "San Antonio",
      eventDate: "2026-07-11",
      animalTags: ["858000064429766", "858000064423859"],
      buyer: null,
      price: null,
      weightKg: null,
    },
  })),
  linkSaleSettlementAction: vi.fn(async () => undefined),
}));

async function uploadSettlement(user: ReturnType<typeof userEvent.setup>) {
  const file = new File(["dummy"], "liquidacion.pdf", { type: "application/pdf" });
  await user.upload(screen.getByLabelText(/archivo/i), file);
  await user.click(screen.getByRole("button", { name: /subir/i }));
}

describe("SaleSettlementForm", () => {
  it("shows the matched venta and links it on confirm", async () => {
    render(<SaleSettlementForm />);
    const user = userEvent.setup();

    await uploadSettlement(user);

    await waitFor(() => expect(screen.getByText("San Antonio")).toBeInTheDocument());
    expect(screen.getByText("D963691")).toBeInTheDocument();
    expect(screen.getByText("858000064429766")).toBeInTheDocument();
    expect(screen.getByText("Cledinor S.A. (se va a completar)")).toBeInTheDocument();
    expect(screen.getByText("5.2189 (se va a completar)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /vincular/i }));

    const { linkSaleSettlementAction } = await import("@/app/(protected)/activities/sale-settlement/actions");
    await waitFor(() => expect(linkSaleSettlementAction).toHaveBeenCalled());
  });

  it("shows the error when no venta matches", async () => {
    const { previewSaleSettlement } = await import("@/app/(protected)/activities/sale-settlement/actions");
    vi.mocked(previewSaleSettlement).mockResolvedValueOnce({
      ok: false,
      error: "No se encontró ninguna venta con la guía D000000",
    });

    render(<SaleSettlementForm />);
    const user = userEvent.setup();

    await uploadSettlement(user);

    await waitFor(() => expect(screen.getByText(/No se encontró ninguna venta/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /vincular/i })).not.toBeInTheDocument();
  });
});
