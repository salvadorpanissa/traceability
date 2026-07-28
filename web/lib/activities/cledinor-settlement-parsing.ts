import { extractPositionedTextItems, reconstructLines } from "@/lib/activities/pdf-text-extraction";
import { normalizeDate } from "@/lib/activities/date-normalization";

export type CledinorSettlement = {
  guideNumber: string;
  weighDate: string;
  total: string;
  weightKg: string | null;
  pricePerKg: string | null;
};

const GUIDE_NUMBER_RE = /Gu[ií]as asociadas\s+(\S+)/i;
const WEIGH_DATE_RE = /Fecha pesada\s+(\d{1,2}\/\d{1,2}\/\d{4})/i;
const TOTAL_RE = /^TOTAL\s+([\d.,]+)/;
const CATEGORY_ROW_RE = /^[A-ZÁÉÍÓÚÑ]+(?:\s+[\d.,]+){13}$/;

function parseUruguayanNumber(raw: string): string {
  return raw.replace(/\./g, "").replace(",", ".");
}

export async function parseCledinorSettlement(buffer: ArrayBuffer): Promise<CledinorSettlement> {
  const items = await extractPositionedTextItems(buffer);
  const lines = reconstructLines(items);

  const guideMatch = GUIDE_NUMBER_RE.exec(lines.find((l) => GUIDE_NUMBER_RE.test(l)) ?? "");
  if (!guideMatch) throw new Error("No se encontró el número de guía en la liquidación");

  const dateMatch = WEIGH_DATE_RE.exec(lines.find((l) => WEIGH_DATE_RE.test(l)) ?? "");
  if (!dateMatch) throw new Error("No se encontró la fecha de pesada en la liquidación");
  const weighDate = normalizeDate(dateMatch[1]);
  if (!weighDate) throw new Error("La fecha de pesada tiene un formato no reconocido");

  const totalLine = lines.find((l) => TOTAL_RE.test(l.trim()));
  const totalMatch = totalLine ? TOTAL_RE.exec(totalLine.trim()) : null;
  if (!totalMatch) throw new Error("No se encontró el total en la liquidación");

  const categoryRows = lines.filter((l) => CATEGORY_ROW_RE.test(l.trim()));
  let weightKg: string | null = null;
  let pricePerKg: string | null = null;
  if (categoryRows.length === 1) {
    const fields = categoryRows[0].trim().split(/\s+/).slice(1);
    weightKg = parseUruguayanNumber(fields[8]);
    pricePerKg = parseUruguayanNumber(fields[9]);
  }

  return {
    guideNumber: guideMatch[1],
    weighDate,
    total: parseUruguayanNumber(totalMatch[1]),
    weightKg,
    pricePerKg,
  };
}
