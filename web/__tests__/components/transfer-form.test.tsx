import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransferForm } from "@/components/activities/transfer-form";
import { previewTransferBatch } from "@/app/(protected)/activities/transfer/actions";

// This project's vitest config doesn't enable `globals`, so
// @testing-library/react's automatic afterEach cleanup never registers —
// see __tests__/components/dashboard/livestock-status-table.test.tsx for
// the full explanation.
afterEach(cleanup);

vi.mock("@/app/(protected)/activities/transfer/actions", () => ({
  previewTransferBatch: vi.fn(async () => ({
    mappingNeeded: false,
    headerSignature: '["IDE"]',
    mapping: [{ header: "IDE", meaning: "tag" }],
    rows: [
      {
        tag: "AR000000000030",
        eventDate: "2026-02-01",
        status: "new",
        categoryId: null,
        sex: null,
        ownerId: null,
        pendingOwnerName: "Gómez",
      },
    ],
    detectedEventDate: null,
  })),
  confirmTransferBatchAction: vi.fn(async () => undefined),
  createOwnerAction: vi.fn(async (name: string) => ({ id: "o1", name })),
  listPaddocksAction: vi.fn(async () => [{ id: "p1", name: "Potrero 1", farmId: "farm-1" }]),
  createPaddockAction: vi.fn(async (_farmId: string, name: string) => ({ id: "p2", name, farmId: "farm-1" })),
}));

const farms = [
  { id: "farm-1", name: "Campo Norte" },
  { id: "farm-2", name: "Campo Sur" },
];

describe("TransferForm", () => {
  it("shows the preview after uploading a file", async () => {
    render(<TransferForm farms={farms} />);
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

  it("disables Confirmar while an owner is pending, and enables it once created inline plus a destination is set", async () => {
    render(<TransferForm farms={farms} />);
    const user = userEvent.setup();

    const file = new File(["dummy"], "lote.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await user.upload(screen.getByLabelText(/archivo/i), file);
    await user.click(screen.getByRole("button", { name: /subir/i }));

    await waitFor(() => expect(screen.getByText("AR000000000030")).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText(/campo destino/i), "farm-1");

    expect(screen.getByRole("button", { name: /confirmar/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /confirmar/i })).not.toBeDisabled());
  });

  it("auto-fills Fecha from the detected date once, without overriding a later manual edit", async () => {
    vi.mocked(previewTransferBatch).mockResolvedValueOnce({
      mappingNeeded: false,
      headerSignature: '["IDE"]',
      mapping: [{ header: "IDE", meaning: "tag" }],
      rows: [
        {
          tag: "AR000000000040",
          eventDate: "2026-03-10",
          status: "new",
          categoryId: null,
          sex: null,
          ownerId: null,
          pendingOwnerName: null,
        },
      ],
      detectedEventDate: "2026-03-10",
    });

    render(<TransferForm farms={farms} />);
    const user = userEvent.setup();

    const file = new File(["dummy"], "lote.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await user.upload(screen.getByLabelText(/archivo/i), file);
    await user.click(screen.getByRole("button", { name: /subir/i }));

    await waitFor(() => expect(screen.getByLabelText("Fecha")).toHaveValue("2026-03-10"));

    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-05-01" } });

    vi.mocked(previewTransferBatch).mockResolvedValueOnce({
      mappingNeeded: false,
      headerSignature: '["IDE"]',
      mapping: [{ header: "IDE", meaning: "tag" }],
      rows: [
        {
          tag: "AR000000000041",
          eventDate: "2026-05-01",
          status: "new",
          categoryId: null,
          sex: null,
          ownerId: null,
          pendingOwnerName: null,
        },
      ],
      detectedEventDate: "2026-07-01",
    });
    await user.click(screen.getByRole("button", { name: /subir/i }));

    await waitFor(() => expect(screen.getByText("AR000000000041")).toBeInTheDocument());
    expect(screen.getByLabelText("Fecha")).toHaveValue("2026-05-01");
  });
});
