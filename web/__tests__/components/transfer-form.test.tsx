import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransferForm } from "@/components/activities/transfer-form";

vi.mock("@/app/(protected)/activities/transfer/actions", () => ({
  previewTransferBatch: vi.fn(async () => ({
    mappingNeeded: false,
    headerSignature: '["IDE"]',
    mapping: [{ header: "IDE", meaning: "tag" }],
    rows: [{ tag: "AR000000000030", eventDate: "2026-02-01", status: "new", categoryId: null }],
  })),
  confirmTransferBatchAction: vi.fn(async () => undefined),
}));

describe("TransferForm", () => {
  it("shows the preview after uploading a file", async () => {
    render(<TransferForm />);
    const user = userEvent.setup();

    const file = new File(["dummy"], "lote.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const fileInput = screen.getByLabelText(/archivo/i);
    await user.upload(fileInput, file);
    await user.click(screen.getByRole("button", { name: /subir/i }));

    await waitFor(() => expect(screen.getByText("AR000000000030")).toBeInTheDocument());
    expect(screen.getByText(/nuevo/i)).toBeInTheDocument();
  });
});
