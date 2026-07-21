import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PendingOwnerEditor } from "@/components/activities/pending-owner-editor";

afterEach(cleanup);

describe("PendingOwnerEditor", () => {
  it("renders one inline-creation row per distinct pending name, pre-filled and editable", async () => {
    const onCreateOwner = vi.fn(async (name: string) => ({ id: "o1", name }));
    const onResolved = vi.fn();

    render(
      <PendingOwnerEditor pendingNames={["Gómez", "Díaz"]} onCreateOwner={onCreateOwner} onResolved={onResolved} />
    );

    const inputs = screen.getAllByLabelText("Nombre del propietario");
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toHaveValue("Gómez");
    expect(inputs[1]).toHaveValue("Díaz");
  });

  it("creates a pending owner and reports the resolved id, then removes that row", async () => {
    const onCreateOwner = vi.fn(async (name: string) => ({ id: "o2", name }));
    const onResolved = vi.fn();
    const user = userEvent.setup();

    render(<PendingOwnerEditor pendingNames={["Gómez"]} onCreateOwner={onCreateOwner} onResolved={onResolved} />);

    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(onCreateOwner).toHaveBeenCalledWith("Gómez"));
    expect(onResolved).toHaveBeenCalledWith("Gómez", "o2");
    await waitFor(() => expect(screen.queryByLabelText("Nombre del propietario")).not.toBeInTheDocument());
  });

  it("shows an error and keeps the row if creation fails", async () => {
    const onCreateOwner = vi.fn(async () => {
      throw new Error("El nombre ya existe");
    });
    const user = userEvent.setup();

    render(<PendingOwnerEditor pendingNames={["Gómez"]} onCreateOwner={onCreateOwner} onResolved={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(screen.getByText("El nombre ya existe")).toBeInTheDocument());
    expect(screen.getByLabelText("Nombre del propietario")).toBeInTheDocument();
  });

  it("renders nothing when there are no pending names", () => {
    const { container } = render(
      <PendingOwnerEditor pendingNames={[]} onCreateOwner={vi.fn()} onResolved={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
