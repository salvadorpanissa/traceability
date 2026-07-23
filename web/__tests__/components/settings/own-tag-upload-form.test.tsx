import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OwnTagUploadForm } from "@/components/settings/own-tag-upload-form";
import {
  previewOwnTagUpload,
  confirmOwnTagUpload,
  createOwnTagPaddockAction,
  createOwnTagCategoryAction,
} from "@/app/(protected)/settings/own-tags/actions";

afterEach(cleanup);

vi.mock("@/app/(protected)/settings/own-tags/actions", () => ({
  previewOwnTagUpload: vi.fn(),
  confirmOwnTagUpload: vi.fn(),
  createOwnTagPaddockAction: vi.fn(),
  createOwnTagCategoryAction: vi.fn(),
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
  it("previews then confirms a file for the selected registration, showing the import result", async () => {
    vi.mocked(previewOwnTagUpload).mockResolvedValue({
      mappingNeeded: false,
      headerSignature: "sig",
      mapping: [{ header: "Caravana", meaning: "tag" }],
      rows: [
        { tag: "100", sex: null, category: null, birthDate: null, paddock: null, date: null },
        { tag: "200", sex: null, category: null, birthDate: null, paddock: null, date: null },
      ],
      pendingPaddockNames: [],
      pendingCategoryNames: [],
    });
    vi.mocked(confirmOwnTagUpload).mockResolvedValue({
      inserted: 1,
      updated: 0,
      located: 0,
      recategorized: 0,
      skipped: 1,
      invalid: 0,
    });

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
      expect(
        screen.getByText(
          "2 caravanas encontradas en el archivo. No mapeaste una columna de potrero, así que solo se registran (sin ubicación) hasta el próximo traslado o sanidad."
        )
      ).toBeInTheDocument()
    );
    expect(previewOwnTagUpload).toHaveBeenCalledWith("reg-1", expect.any(FormData));

    await userEvent.click(screen.getByRole("button", { name: "Confirmar carga" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "1 caravanas nuevas, 0 actualizadas, 0 ubicadas, 0 recategorizadas, 1 sin cambios, 0 filas inválidas ignoradas."
        )
      ).toBeInTheDocument()
    );
    expect(confirmOwnTagUpload).toHaveBeenCalledWith("reg-1", "sig", [{ header: "Caravana", meaning: "tag" }], [
      { tag: "100", sex: null, category: null, birthDate: null, paddock: null, date: null },
      { tag: "200", sex: null, category: null, birthDate: null, paddock: null, date: null },
    ]);
  });

  it("tells the user the animals will be located when a paddock column is mapped and no new paddocks are needed", async () => {
    vi.mocked(previewOwnTagUpload).mockResolvedValue({
      mappingNeeded: false,
      headerSignature: "sig-2",
      mapping: [
        { header: "Caravana", meaning: "tag" },
        { header: "Potrero", meaning: "paddock" },
      ],
      rows: [{ tag: "300", sex: null, category: null, birthDate: null, paddock: "Potrero 1", date: null }],
      pendingPaddockNames: [],
      pendingCategoryNames: [],
    });

    render(<OwnTagUploadForm registrations={[registration]} counts={[]} />);

    await userEvent.selectOptions(screen.getByLabelText("Registro DICOSE"), "reg-1");
    const file = new File(["Caravana,Potrero\n300,Potrero 1"], "tags.xlsx");
    await userEvent.upload(screen.getByLabelText("Archivo"), file);
    await userEvent.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() =>
      expect(
        screen.getByText("1 caravanas encontradas en el archivo. Se van a ubicar directamente en su potrero.")
      ).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: "Confirmar carga" })).toBeEnabled();
  });

  it("asks to create missing paddocks before allowing confirmation", async () => {
    vi.mocked(previewOwnTagUpload).mockResolvedValue({
      mappingNeeded: false,
      headerSignature: "sig-3",
      mapping: [
        { header: "Caravana", meaning: "tag" },
        { header: "Potrero", meaning: "paddock" },
      ],
      rows: [{ tag: "400", sex: null, category: null, birthDate: null, paddock: "Potrero Nuevo", date: null }],
      pendingPaddockNames: ["Potrero Nuevo"],
      pendingCategoryNames: [],
    });
    vi.mocked(createOwnTagPaddockAction).mockResolvedValue({ id: "p1", name: "Potrero Nuevo", farmId: "farm-1" });

    render(<OwnTagUploadForm registrations={[registration]} counts={[]} />);

    await userEvent.selectOptions(screen.getByLabelText("Registro DICOSE"), "reg-1");
    const file = new File(["Caravana,Potrero\n400,Potrero Nuevo"], "tags.xlsx");
    await userEvent.upload(screen.getByLabelText("Archivo"), file);
    await userEvent.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => expect(screen.getByText("Potreros nuevos por crear")).toBeInTheDocument());
    expect(screen.getByText("Potrero Nuevo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar carga" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Crear potrero" }));

    expect(createOwnTagPaddockAction).toHaveBeenCalledWith("farm-1", "Potrero Nuevo");
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar carga" })).toBeEnabled());
    expect(screen.queryByText("Potreros nuevos por crear")).not.toBeInTheDocument();
  });

  it("asks to create missing categories before allowing confirmation", async () => {
    vi.mocked(previewOwnTagUpload).mockResolvedValue({
      mappingNeeded: false,
      headerSignature: "sig-4",
      mapping: [
        { header: "Caravana", meaning: "tag" },
        { header: "Categoria", meaning: "category" },
      ],
      rows: [{ tag: "500", sex: null, category: "Vaca", birthDate: null, paddock: null, date: null }],
      pendingPaddockNames: [],
      pendingCategoryNames: ["Vaca"],
    });
    vi.mocked(createOwnTagCategoryAction).mockResolvedValue({ id: "c1", name: "Vaca", sortOrder: 0 });

    render(<OwnTagUploadForm registrations={[registration]} counts={[]} />);

    await userEvent.selectOptions(screen.getByLabelText("Registro DICOSE"), "reg-1");
    const file = new File(["Caravana,Categoria\n500,Vaca"], "tags.xlsx");
    await userEvent.upload(screen.getByLabelText("Archivo"), file);
    await userEvent.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => expect(screen.getByText("Categorías nuevas por crear")).toBeInTheDocument());
    expect(screen.getByText("Vaca")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar carga" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Crear categoría" }));

    expect(createOwnTagCategoryAction).toHaveBeenCalledWith("Vaca");
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar carga" })).toBeEnabled());
    expect(screen.queryByText("Categorías nuevas por crear")).not.toBeInTheDocument();
  });

  it("shows a column mapper when the file's headers aren't recognized yet", async () => {
    vi.mocked(previewOwnTagUpload).mockResolvedValue({
      mappingNeeded: true,
      headers: ["Caravana", "Sexo"],
      initialMapping: null,
    });

    render(<OwnTagUploadForm registrations={[registration]} counts={[]} />);

    await userEvent.selectOptions(screen.getByLabelText("Registro DICOSE"), "reg-1");
    const file = new File(["Caravana,Sexo\n100,HEMBRA"], "tags.xlsx");
    await userEvent.upload(screen.getByLabelText("Archivo"), file);
    await userEvent.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => expect(screen.getByLabelText("Caravana")).toBeInTheDocument());
    expect(screen.getByLabelText("Sexo")).toBeInTheDocument();
  });
});
