import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OwnTagUploadForm } from "@/components/settings/own-tag-upload-form";
import { uploadOwnTags } from "@/app/(protected)/settings/own-tags/actions";

afterEach(cleanup);

vi.mock("@/app/(protected)/settings/own-tags/actions", () => ({
  uploadOwnTags: vi.fn(),
}));

const registration = {
  id: "reg-1",
  ownerId: "owner-1",
  ownerName: "AIP",
  farmId: "farm-1",
  farmName: "Campo San Antonio",
  dicoseCode: "151400442",
};

describe("OwnTagUploadForm", () => {
  it("uploads a file for the selected registration and shows the import result", async () => {
    vi.mocked(uploadOwnTags).mockResolvedValue({ inserted: 3, skipped: 1, invalid: 0 });

    render(
      <OwnTagUploadForm
        registrations={[registration]}
        counts={[{ registration, count: 10, lastUploadedAt: "2026-01-01T00:00:00.000Z" }]}
      />
    );

    expect(screen.getByText("10")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Registro DICOSE"), "reg-1");
    const file = new File(["tag\n100\n200"], "tags.xlsx");
    await userEvent.upload(screen.getByLabelText("Archivo"), file);
    await userEvent.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() =>
      expect(screen.getByText("3 caravanas nuevas cargadas, 1 ya existían, 0 filas inválidas ignoradas.")).toBeInTheDocument()
    );
    expect(uploadOwnTags).toHaveBeenCalledWith("reg-1", expect.any(FormData));
  });
});
