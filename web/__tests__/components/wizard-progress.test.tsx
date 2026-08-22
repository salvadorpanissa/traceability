import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WizardProgress } from "@/components/activities/wizard-progress";

afterEach(cleanup);

const steps = [
  { key: "file", label: "Archivo" },
  { key: "mapping", label: "Mapeo" },
  { key: "review", label: "Revisión" },
];

describe("WizardProgress", () => {
  it("renders every step label", () => {
    render(<WizardProgress steps={steps} currentIndex={1} />);
    expect(screen.getByText(/Archivo/)).toBeInTheDocument();
    expect(screen.getByText(/Mapeo/)).toBeInTheDocument();
    expect(screen.getByText(/Revisión/)).toBeInTheDocument();
  });

  it("marks the current step and distinguishes it from completed/upcoming ones", () => {
    render(<WizardProgress steps={steps} currentIndex={1} />);
    const current = screen.getByText(/Mapeo/);
    const completed = screen.getByText(/Archivo/);
    const upcoming = screen.getByText(/Revisión/);
    expect(current.closest("[data-status]")).toHaveAttribute("data-status", "current");
    expect(completed.closest("[data-status]")).toHaveAttribute("data-status", "completed");
    expect(upcoming.closest("[data-status]")).toHaveAttribute("data-status", "upcoming");
  });
});
