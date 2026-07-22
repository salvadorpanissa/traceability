import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DicoseRegistrationForm } from "@/components/settings/dicose-registration-form";
import { createDicoseRegistrationAction } from "@/app/(protected)/settings/dicose/actions";

afterEach(cleanup);

vi.mock("@/app/(protected)/settings/dicose/actions", () => ({
  createDicoseRegistrationAction: vi.fn(),
}));

describe("DicoseRegistrationForm", () => {
  it("lists existing registrations and adds a new one", async () => {
    vi.mocked(createDicoseRegistrationAction).mockResolvedValue({
      id: "reg-2",
      ownerId: "owner-2",
      ownerName: "SASG",
      farmId: "farm-1",
      farmName: "Campo San Antonio",
      dicoseCode: "151422799",
    });

    render(
      <DicoseRegistrationForm
        registrations={[
          {
            id: "reg-1",
            ownerId: "owner-1",
            ownerName: "AIP",
            farmId: "farm-1",
            farmName: "Campo San Antonio",
            dicoseCode: "151400442",
          },
        ]}
        owners={[
          { id: "owner-1", name: "AIP" },
          { id: "owner-2", name: "SASG" },
        ]}
        farms={[{ id: "farm-1", name: "Campo San Antonio" }]}
      />
    );

    expect(screen.getByText("151400442")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Dueño"), "owner-2");
    await userEvent.selectOptions(screen.getByLabelText("Campo"), "farm-1");
    await userEvent.type(screen.getByLabelText("Código DICOSE"), "151422799");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(screen.getByText("151422799")).toBeInTheDocument());
    expect(createDicoseRegistrationAction).toHaveBeenCalledWith({
      ownerId: "owner-2",
      farmId: "farm-1",
      dicoseCode: "151422799",
    });
  });
});
