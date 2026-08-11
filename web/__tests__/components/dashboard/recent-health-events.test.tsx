import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecentHealthEvents } from "@/components/dashboard/recent-health-events";
import { voidHealthBatchAction } from "@/app/(protected)/activities/health/actions";
import { LocaleProvider } from "@/lib/i18n/context";
import type { HealthBatchRow } from "@/lib/dashboard/health-batch-summary";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@/app/(protected)/activities/health/actions", () => ({
  voidHealthBatchAction: vi.fn(),
}));

const batches: HealthBatchRow[] = [
  {
    batchId: "batch-1",
    eventDate: "2026-08-11",
    establishmentName: "San Antonio",
    paddockName: "Arerunguá",
    productName: "FLOK",
    animalCount: 151,
  },
];

describe("RecentHealthEvents", () => {
  it("removes a batch from the list once it's voided", async () => {
    vi.mocked(voidHealthBatchAction).mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <LocaleProvider initialLocale="es">
        <RecentHealthEvents batches={batches} />
      </LocaleProvider>
    );
    const user = userEvent.setup();

    expect(screen.getByText("FLOK")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Anular" }));

    await waitFor(() => expect(voidHealthBatchAction).toHaveBeenCalledWith("batch-1"));
    await waitFor(() => expect(screen.queryByText("FLOK")).not.toBeInTheDocument());
  });

  it("does not call the action when the user cancels the confirm dialog", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <LocaleProvider initialLocale="es">
        <RecentHealthEvents batches={batches} />
      </LocaleProvider>
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Anular" }));

    expect(voidHealthBatchAction).not.toHaveBeenCalled();
    expect(screen.getByText("FLOK")).toBeInTheDocument();
  });

  it("shows an inline error and keeps the batch when voiding fails", async () => {
    vi.mocked(voidHealthBatchAction).mockRejectedValue(new Error("No tenés acceso"));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <LocaleProvider initialLocale="es">
        <RecentHealthEvents batches={batches} />
      </LocaleProvider>
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Anular" }));

    await waitFor(() => expect(screen.getByText("No se pudo anular. Probá de nuevo.")).toBeInTheDocument());
    expect(screen.getByText("FLOK")).toBeInTheDocument();
  });
});
