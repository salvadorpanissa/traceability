import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecentHealthEvents } from "@/components/dashboard/recent-health-events";
import { voidHealthBatchAction, getHealthBatchDetailAction } from "@/app/(protected)/activities/health/actions";
import { LocaleProvider } from "@/lib/i18n/context";
import type { HealthBatchRow, HealthBatchDetail } from "@/lib/dashboard/health-batch-summary";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@/app/(protected)/activities/health/actions", () => ({
  voidHealthBatchAction: vi.fn(),
  getHealthBatchDetailAction: vi.fn(),
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

  it("opens a detail modal with each animal's tag, withdrawal, and notes, plus product and paddock", async () => {
    const detail: HealthBatchDetail = {
      batchId: "batch-1",
      eventDate: "2026-08-11",
      establishmentName: "San Antonio",
      paddockName: "Arerunguá",
      products: [{ name: "FLOK", dose: "2", doseUnit: "ml", route: "subcutánea", withdrawalDays: 21 }],
      animals: [
        { tag: "001", eventDate: "2026-08-11", notes: "Cojera pata trasera", withdrawalUntil: "2026-09-01" },
        { tag: "002", eventDate: "2026-08-11", notes: null, withdrawalUntil: "2026-09-01" },
      ],
    };
    vi.mocked(getHealthBatchDetailAction).mockResolvedValue(detail);
    render(
      <LocaleProvider initialLocale="es">
        <RecentHealthEvents batches={batches} />
      </LocaleProvider>
    );
    const user = userEvent.setup();

    await user.click(screen.getByText("FLOK"));

    await waitFor(() => expect(getHealthBatchDetailAction).toHaveBeenCalledWith("batch-1"));
    await waitFor(() => expect(screen.getByText("San Antonio, Arerunguá")).toBeInTheDocument());
    // Header shows the full date once; per-animal rows omit the redundant
    // date column since every animal shares it, so it doesn't repeat.
    expect(screen.getAllByText("11 de agosto de 2026")).toHaveLength(1);
    expect(screen.getByText("001")).toBeInTheDocument();
    expect(screen.getByText("Cojera pata trasera")).toBeInTheDocument();
    expect(screen.getByText("002")).toBeInTheDocument();
    expect(screen.getAllByText("1 set. 2026")).toHaveLength(2);
    expect(screen.getByText("2 ml")).toBeInTheDocument();
    expect(screen.getByText("subcutánea")).toBeInTheDocument();
  });

  it("shows a per-animal date column when an animal's event date differs from the batch header date", async () => {
    const detail: HealthBatchDetail = {
      batchId: "batch-1",
      eventDate: "2026-08-11",
      establishmentName: "San Antonio",
      paddockName: "Arerunguá",
      products: [{ name: "FLOK", dose: "2", doseUnit: "ml", route: "subcutánea", withdrawalDays: 21 }],
      animals: [
        { tag: "001", eventDate: "2026-08-10", notes: null, withdrawalUntil: null },
        { tag: "002", eventDate: "2026-08-11", notes: null, withdrawalUntil: null },
      ],
    };
    vi.mocked(getHealthBatchDetailAction).mockResolvedValue(detail);
    render(
      <LocaleProvider initialLocale="es">
        <RecentHealthEvents batches={batches} />
      </LocaleProvider>
    );
    const user = userEvent.setup();

    await user.click(screen.getByText("FLOK"));

    await waitFor(() => expect(screen.getByText("10 ago. 2026")).toBeInTheDocument());
    expect(screen.getByText("11 ago. 2026")).toBeInTheDocument();
  });

  it("does not open the detail modal when clicking the void button", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <LocaleProvider initialLocale="es">
        <RecentHealthEvents batches={batches} />
      </LocaleProvider>
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Anular" }));

    expect(getHealthBatchDetailAction).not.toHaveBeenCalled();
  });
});
