import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HealthByPlaceTable } from "@/components/dashboard/health-by-place-table";
import { loadHealthByPlaceAction } from "@/app/(protected)/dashboard/health-summary-actions";
import type { HealthByPlaceRow } from "@/lib/dashboard/health-place-summary";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@/app/(protected)/dashboard/health-summary-actions", () => ({
  loadHealthByPlaceAction: vi.fn(),
}));

const initialRows: HealthByPlaceRow[] = [
  {
    farmName: "Campo Norte",
    paddockName: "Potrero 1",
    count: 2,
    events: [
      { eventId: "e1", eventDate: "2026-06-01", animalTag: "AR1", farmId: "f1", farmName: "Campo Norte", paddockId: "p1", paddockName: "Potrero 1", productName: "Ivermectina 1%" },
      { eventId: "e2", eventDate: "2026-06-02", animalTag: "AR2", farmId: "f1", farmName: "Campo Norte", paddockId: "p1", paddockName: "Potrero 1", productName: "Aftosa" },
    ],
  },
];

describe("HealthByPlaceTable", () => {
  it("renders the initial rows with campo, potrero, and count", () => {
    render(<HealthByPlaceTable initialRows={initialRows} initialMonths={3} locale="es" />);

    expect(screen.getByText("Campo Norte")).toBeInTheDocument();
    expect(screen.getByText("Potrero 1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("expands a group to list its individual health events", async () => {
    render(<HealthByPlaceTable initialRows={initialRows} initialMonths={3} locale="es" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /expandir/i }));

    expect(screen.getByText("2026-06-01")).toBeInTheDocument();
    expect(screen.getByText("AR1")).toBeInTheDocument();
    expect(screen.getByText("Ivermectina 1%")).toBeInTheDocument();
    expect(screen.getByText("AR2")).toBeInTheDocument();
  });

  it("reloads the table when the months selector changes", async () => {
    const updatedRows: HealthByPlaceRow[] = [
      { farmName: "Cuatro Cerros", paddockName: null, count: 1, events: [] },
    ];
    vi.mocked(loadHealthByPlaceAction).mockResolvedValue(updatedRows);

    render(<HealthByPlaceTable initialRows={initialRows} initialMonths={3} locale="es" />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("Últimos"), "6");

    await waitFor(() => expect(loadHealthByPlaceAction).toHaveBeenCalledWith(6));
    await waitFor(() => expect(screen.getByText("Cuatro Cerros")).toBeInTheDocument());
  });
});
