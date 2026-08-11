import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StaleTagAlerts } from "@/components/dashboard/stale-tag-alerts";
import { getStaleTagsAction } from "@/app/(protected)/dashboard/stale-tags-actions";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@/app/(protected)/dashboard/stale-tags-actions", () => ({
  getStaleTagsAction: vi.fn(),
}));

const ROW = {
  animalId: "a1",
  currentTag: "AR001",
  establishmentName: "Campo Norte",
  paddockName: "Potrero 1",
  lastEventType: "health",
  lastEventDate: "2025-09-01",
  daysSinceLastEvent: 150,
};

describe("StaleTagAlerts", () => {
  it("renders the initial rows with a link to register a death", () => {
    render(<StaleTagAlerts initialRows={[ROW]} initialThreshold={100} locale="es" />);

    expect(screen.getByText("AR001")).toBeInTheDocument();
    expect(screen.getByText(/150 días sin novedades/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Registrar muerte" });
    expect(link).toHaveAttribute("href", "/activities/death?tag=AR001");
  });

  it("shows the empty state when there are no rows", () => {
    render(<StaleTagAlerts initialRows={[]} initialThreshold={100} locale="es" />);
    expect(screen.getByText("No hay caravanas sin novedades recientes.")).toBeInTheDocument();
  });

  it("re-fetches with the new threshold when the select changes", async () => {
    vi.mocked(getStaleTagsAction).mockResolvedValue([{ ...ROW, currentTag: "AR002", daysSinceLastEvent: 200 }]);
    render(<StaleTagAlerts initialRows={[ROW]} initialThreshold={100} locale="es" />);

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/sin novedades hace más de/i), "150");

    await waitFor(() => expect(getStaleTagsAction).toHaveBeenCalledWith(150));
    await waitFor(() => expect(screen.getByText("AR002")).toBeInTheDocument());
  });
});
