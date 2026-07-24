import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuideDocumentsTable } from "@/components/settings/guide-documents-table";
import { downloadGuideDocumentAction } from "@/app/(protected)/settings/guides/actions";
import type { GuideDocumentSummary } from "@/lib/dal/guide-documents";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

vi.mock("@/app/(protected)/settings/guides/actions", () => ({
  downloadGuideDocumentAction: vi.fn(),
}));

function sampleRow(): GuideDocumentSummary {
  return {
    batchId: "batch-1",
    fileName: "D838153.pdf",
    mimeType: "application/pdf",
    createdAt: new Date("2026-07-23T22:00:00Z"),
    animalCount: 64,
    guideNumber: "D838153",
    originFarmName: "Campo San Antonio",
    destinationFarmName: "Cuatro Cerros",
  };
}

describe("GuideDocumentsTable", () => {
  it("shows identifying info for each guide and triggers a download on click", async () => {
    vi.mocked(downloadGuideDocumentAction).mockResolvedValue({
      fileName: "D838153.pdf",
      mimeType: "application/pdf",
      base64: btoa("fake pdf bytes"),
    });
    const createObjectURL = vi.fn((_blob: Blob) => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<GuideDocumentsTable rows={[sampleRow()]} locale="es" />);

    expect(screen.getByText("D838153")).toBeInTheDocument();
    expect(screen.getByText("Campo San Antonio")).toBeInTheDocument();
    expect(screen.getByText("Cuatro Cerros")).toBeInTheDocument();
    expect(screen.getByText("64")).toBeInTheDocument();
    expect(screen.getByText("D838153.pdf")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Descargar" }));

    await waitFor(() => expect(downloadGuideDocumentAction).toHaveBeenCalledWith("batch-1"));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blobArg = createObjectURL.mock.calls[0][0] as Blob;
    expect(blobArg.type).toBe("application/pdf");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    clickSpy.mockRestore();
  });

  it("shows a friendly empty message when there are no guides", () => {
    render(<GuideDocumentsTable rows={[]} locale="es" />);
    expect(screen.getByText("No hay guías cargadas todavía.")).toBeInTheDocument();
  });

  it("shows a friendly error instead of an unhandled rejection when the download fails", async () => {
    vi.mocked(downloadGuideDocumentAction).mockRejectedValue(new Error("No tenés acceso a este campo"));

    render(<GuideDocumentsTable rows={[sampleRow()]} locale="es" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Descargar" }));

    await waitFor(() =>
      expect(screen.getByText("No se pudo descargar la guía. Probá de nuevo.")).toBeInTheDocument()
    );
  });
});
