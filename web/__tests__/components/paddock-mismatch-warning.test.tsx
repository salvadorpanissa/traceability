import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaddockMismatchWarning } from "@/components/activities/paddock-mismatch-warning";

afterEach(cleanup);

describe("PaddockMismatchWarning", () => {
  it("lists each mismatched caravana with its current potrero name", () => {
    render(
      <PaddockMismatchWarning
        mismatches={[{ tag: "AR000000000090", currentPaddockId: "pd2" }]}
        paddockNameById={new Map([["pd2", "Potrero Sur"]])}
        decision={null}
        onDecide={vi.fn()}
      />
    );

    expect(screen.getByText(/AR000000000090/)).toBeInTheDocument();
    expect(screen.getByText(/Potrero Sur/)).toBeInTheDocument();
  });

  it("calls onDecide(true) when the user chooses to also transfer them", async () => {
    const onDecide = vi.fn();
    render(
      <PaddockMismatchWarning
        mismatches={[{ tag: "AR000000000090", currentPaddockId: "pd2" }]}
        paddockNameById={new Map([["pd2", "Potrero Sur"]])}
        decision={null}
        onDecide={onDecide}
      />
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /sí, trasladarlas/i }));

    expect(onDecide).toHaveBeenCalledWith(true);
  });

  it("calls onDecide(false) when the user chooses to leave them where they are", async () => {
    const onDecide = vi.fn();
    render(
      <PaddockMismatchWarning
        mismatches={[{ tag: "AR000000000090", currentPaddockId: "pd2" }]}
        paddockNameById={new Map([["pd2", "Potrero Sur"]])}
        decision={null}
        onDecide={onDecide}
      />
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /no, dej/i }));

    expect(onDecide).toHaveBeenCalledWith(false);
  });
});
