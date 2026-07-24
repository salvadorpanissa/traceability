import { PDFDocument, StandardFonts } from "pdf-lib";

export type SnigGuideFixtureInput = {
  guideNumber: string;
  eventDateDisplay: string;
  dicoseA: string;
  dicoseB: string;
  dicoseC: string;
  dicoseD: string;
  animals: { tag: string; sex: "H" | "M"; ageMonths: number }[];
};

const OWNER_NAME = "PANISSA SILVA ANTONIO Y HORACIO";
const PAGE_SIZE: [number, number] = [595, 842];
const LEFT_MARGIN = 50;
const RIGHT_COLUMN_X = 300;
const TOP_Y = 800;
const LINE_HEIGHT = 20;
const BOTTOM_MARGIN = 50;

// Mirrors the real SNIG guide's layout closely enough to exercise the
// parser's line-reconstruction and regex matching: label+value pairs drawn
// as a single line each (page 1 header block), and the numbered animal list
// drawn two-per-line across possibly multiple pages (real guides commonly
// carry 50+ animals and overflow to a second page) — this is the one part
// of the layout where two separate drawText calls land on the same y and
// must be reconstructed into one line by reconstructLines.
export async function buildSnigGuideFixturePdf(input: SnigGuideFixtureInput): Promise<ArrayBuffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  let page = pdfDoc.addPage(PAGE_SIZE);
  let y = TOP_Y;

  function drawLine(text: string, x = LEFT_MARGIN) {
    page.drawText(text, { x, y, size: 10, font });
  }

  function newPageIfNeeded() {
    if (y < BOTTOM_MARGIN) {
      page = pdfDoc.addPage(PAGE_SIZE);
      y = TOP_Y;
    }
  }

  drawLine(`FECHA: ${input.eventDateDisplay}`);
  y -= LINE_HEIGHT;
  drawLine(`CORRESPONDE A LA GUÍA DE PROPIEDAD Y TRÁNSITO: ${input.guideNumber}`);
  y -= LINE_HEIGHT;
  drawLine(`DICOSE A: ${input.dicoseA} ${OWNER_NAME}`);
  y -= LINE_HEIGHT;
  drawLine(`DICOSE B: ${input.dicoseB} ${OWNER_NAME}`);
  y -= LINE_HEIGHT;
  drawLine(`DICOSE C: ${input.dicoseC} ${OWNER_NAME}`);
  y -= LINE_HEIGHT;
  drawLine(`DICOSE D: ${input.dicoseD} ${OWNER_NAME}`);
  y -= LINE_HEIGHT * 2;
  drawLine("NÚMEROS DE CARAVANAS:");
  y -= LINE_HEIGHT;

  for (let i = 0; i < input.animals.length; i += 2) {
    newPageIfNeeded();
    const first = input.animals[i];
    drawLine(`${i + 1}) ${first.tag} ${first.sex} ${first.ageMonths}`, LEFT_MARGIN);
    const second = input.animals[i + 1];
    if (second) {
      drawLine(`${i + 2}) ${second.tag} ${second.sex} ${second.ageMonths}`, RIGHT_COLUMN_X);
    }
    y -= LINE_HEIGHT;
  }

  const bytes = await pdfDoc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
