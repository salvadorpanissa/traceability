import { describe, expect, it } from "vitest";
import { detectImportMapping, applyImportColumnMapping } from "@/lib/activities/bulk-import-mapping";

describe("detectImportMapping", () => {
  it("maps every known header to its meaning and unknown headers to ignore", () => {
    const headers = [
      "IDE (caravana electrónica)",
      "Chip secundario",
      "Propietario",
      "Estancia",
      "Potrero actual",
      "Puesto",
      "Categoría",
      "Peso (kg)",
      "Raza",
      "Sexo",
      "Fecha nacimiento",
      "Fecha alta en sistema",
      "Observaciones",
    ];

    const mapping = detectImportMapping(headers);

    expect(mapping).toEqual([
      { header: "IDE (caravana electrónica)", meaning: "tag" },
      { header: "Chip secundario", meaning: "secondaryTag" },
      { header: "Propietario", meaning: "owner" },
      { header: "Estancia", meaning: "establishment" },
      { header: "Potrero actual", meaning: "paddock" },
      { header: "Puesto", meaning: "ignore" },
      { header: "Categoría", meaning: "category" },
      { header: "Peso (kg)", meaning: "ignore" },
      { header: "Raza", meaning: "breed" },
      { header: "Sexo", meaning: "sex" },
      { header: "Fecha nacimiento", meaning: "birthDate" },
      { header: "Fecha alta en sistema", meaning: "eventDate" },
      { header: "Observaciones", meaning: "ignore" },
    ]);
  });
});

describe("applyImportColumnMapping", () => {
  it("extracts each mapped column into its named field, and null for unmapped meanings", () => {
    const headers = ["IDE (caravana electrónica)", "Propietario", "Estancia"];
    const mapping = detectImportMapping(headers);
    const rows = [["858000048233520", "SASG", "San Antonio"]];

    const mapped = applyImportColumnMapping(headers, rows, mapping);

    expect(mapped).toEqual([
      {
        tag: "858000048233520",
        secondaryTag: null,
        ownerName: "SASG",
        establishmentName: "San Antonio",
        paddockName: null,
        categoryName: null,
        breed: null,
        sex: null,
        birthDate: null,
        eventDate: null,
      },
    ]);
  });

  it("returns an empty string tag when the tag column has no mapped header", () => {
    const headers = ["Propietario"];
    const mapping: ReturnType<typeof detectImportMapping> = [{ header: "Propietario", meaning: "owner" }];
    const rows = [["SASG"]];

    const mapped = applyImportColumnMapping(headers, rows, mapping);

    expect(mapped[0].tag).toBe("");
    expect(mapped[0].ownerName).toBe("SASG");
  });
});
