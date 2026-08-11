import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PdfGuideTransferForm } from "@/components/activities/pdf-guide-transfer-form";
import {
  previewTransferBatchFromPdf,
  confirmTransferBatchFromPdfAction,
  listPaddocksAction,
} from "@/app/(protected)/activities/transfer/actions";

afterEach(cleanup);

vi.mock("@/app/(protected)/activities/transfer/actions", () => ({
  previewTransferBatchFromPdf: vi.fn(),
  confirmTransferBatchFromPdfAction: vi.fn(),
  createOwnerAction: vi.fn(),
  listPaddocksAction: vi.fn(),
  createPaddockAction: vi.fn(),
}));

function samplePdfFile(): File {
  return new File([new Uint8Array([1, 2, 3])], "guide.pdf", { type: "application/pdf" });
}

describe("PdfGuideTransferForm", () => {
  it("uploads a PDF, shows the resolved origin/destination/date/guide number, and confirms", async () => {
    vi.mocked(listPaddocksAction).mockResolvedValue([]);
    vi.mocked(previewTransferBatchFromPdf).mockResolvedValue({
      ok: true,
      guideNumber: "D838153",
      eventDate: "2026-07-11",
      originEstablishmentId: "establishment-origin",
      originEstablishmentName: "Campo San Antonio",
      destinationEstablishmentId: "establishment-destination",
      destinationEstablishmentName: "Cuatro Cerros",
      rows: [
        {
          tag: "858000031330866",
          eventDate: "2026-07-11",
          notes: null,
          status: "new",
          categoryId: null,
          sex: "female",
          birthDate: "2019-01-01",
          ownerId: "owner-1",
          pendingOwnerName: null,
        },
      ],
    });
    vi.mocked(confirmTransferBatchFromPdfAction).mockResolvedValue(undefined);

    render(<PdfGuideTransferForm establishments={[]} />);

    const user = userEvent.setup();
    const fileInput = screen.getByLabelText("Archivo");
    await user.upload(fileInput, samplePdfFile());
    await user.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => expect(screen.getByText("Campo San Antonio")).toBeInTheDocument());
    expect(screen.getByText("Cuatro Cerros")).toBeInTheDocument();
    expect(screen.getByText("D838153")).toBeInTheDocument();
    expect(screen.getByText("858000031330866")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(confirmTransferBatchFromPdfAction).toHaveBeenCalledTimes(1));
    const submittedFormData = vi.mocked(confirmTransferBatchFromPdfAction).mock.calls[0][0];
    expect(submittedFormData.get("file")).toBeInstanceOf(File);
    expect((submittedFormData.get("file") as File).name).toBe("guide.pdf");
    expect(submittedFormData.get("originEstablishmentId")).toBe("establishment-origin");
    expect(submittedFormData.get("destinationEstablishmentId")).toBe("establishment-destination");
    expect(submittedFormData.get("destinationPaddockId")).toBeNull();
    expect(submittedFormData.get("guideNumber")).toBe("D838153");
    expect(JSON.parse(submittedFormData.get("rows") as string)).toHaveLength(1);
    expect(screen.getByText("Lote confirmado.")).toBeInTheDocument();
  });

  it("shows an inline error and no preview when the DICOSE lookup fails", async () => {
    vi.mocked(previewTransferBatchFromPdf).mockResolvedValue({
      ok: false,
      error: "No hay ningún campo registrado con DICOSE 999999999",
    });

    render(<PdfGuideTransferForm establishments={[]} />);

    const user = userEvent.setup();
    await user.upload(screen.getByLabelText("Archivo"), samplePdfFile());
    await user.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() =>
      expect(screen.getByText("No hay ningún campo registrado con DICOSE 999999999")).toBeInTheDocument()
    );
    expect(screen.queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();
  });
});
