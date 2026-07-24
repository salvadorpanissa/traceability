import { extractPositionedTextItems, reconstructLines } from "@/lib/activities/pdf-text-extraction";
import { normalizeDate } from "@/lib/activities/date-normalization";

export type SnigGuide = {
  guideNumber: string;
  eventDate: string;
  originDicoseCode: string;
  destinationDicoseCode: string;
  animals: { tag: string; sex: string | null; ageMonths: number | null }[];
};

const GUIDE_NUMBER_RE = /CORRESPONDE A LA GU[IÍ]A DE PROPIEDAD Y TR[AÁ]NSITO:[^\S\n]*(\S+)/i;
const DATE_RE = /FECHA:[^\S\n]*(\d{1,2}\/\d{1,2}\/\d{4})/i;
const DICOSE_C_RE = /DICOSE C:[^\S\n]*(\S+)/i;
const DICOSE_D_RE = /DICOSE D:[^\S\n]*(\S+)/i;
const ANIMAL_ENTRY_RE = /\d+\)\s+(\S+)\s+([HM])\s+(\d+)/g;

export async function parseSnigGuide(buffer: ArrayBuffer): Promise<SnigGuide> {
  const items = await extractPositionedTextItems(buffer);
  const fullText = reconstructLines(items).join("\n");

  const guideNumberMatch = GUIDE_NUMBER_RE.exec(fullText);
  if (!guideNumberMatch) throw new Error("No se encontró el número de guía en el PDF");

  const dateMatch = DATE_RE.exec(fullText);
  if (!dateMatch) throw new Error("No se encontró la fecha en el PDF");
  const eventDate = normalizeDate(dateMatch[1]);
  if (!eventDate) throw new Error("La fecha del PDF tiene un formato no reconocido");

  const originMatch = DICOSE_C_RE.exec(fullText);
  if (!originMatch) throw new Error("No se encontró el DICOSE C (origen) en el PDF");

  const destinationMatch = DICOSE_D_RE.exec(fullText);
  if (!destinationMatch) throw new Error("No se encontró el DICOSE D (destino) en el PDF");

  const animals: SnigGuide["animals"] = [];
  for (const match of fullText.matchAll(ANIMAL_ENTRY_RE)) {
    const [, tag, sexLetter, ageStr] = match;
    animals.push({ tag, sex: sexLetter, ageMonths: Number(ageStr) });
  }
  if (animals.length === 0) throw new Error("No se encontraron caravanas en el PDF");

  return {
    guideNumber: guideNumberMatch[1],
    eventDate,
    originDicoseCode: originMatch[1],
    destinationDicoseCode: destinationMatch[1],
    animals,
  };
}
