import { PDFDocument, StandardFonts } from "pdf-lib";

export type CledinorSettlementFixtureInput = {
  guideNumber: string;
  weighDateDisplay: string; // "11/07/2026"
  subTotal: string; // "24.135,51" — must NOT be picked up as the total
  total: string; // "23.396,21"
  categoryRows: string[]; // fully-formed lines, e.g. "VACA 18 9.300,00 516,67 2,5810 4.946,80 274,82 4,8522 4.599,30 255,52 5,2189 53,19 49,45 7,02"
};

const PAGE_SIZE: [number, number] = [595, 842];
const LEFT_MARGIN = 50;
const TOP_Y = 800;
const LINE_HEIGHT = 20;

// Mirrors the real Cledinor liquidación closely enough to exercise the
// parser: label+value pairs on page 1 (guide number, weigh date, sub
// total, total — order doesn't matter, the real document doesn't put them
// adjacent either), and the page-2 "RESUMEN POR CATEGORÍA" table rows as
// one line each.
export async function buildCledinorSettlementFixturePdf(input: CledinorSettlementFixtureInput): Promise<ArrayBuffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const page1 = pdfDoc.addPage(PAGE_SIZE);
  let y = TOP_Y;
  function drawLine(page: typeof page1, text: string) {
    page.drawText(text, { x: LEFT_MARGIN, y, size: 10, font });
    y -= LINE_HEIGHT;
  }

  drawLine(page1, `Fecha pesada ${input.weighDateDisplay}`);
  drawLine(page1, `Guías asociadas ${input.guideNumber}`);
  drawLine(page1, `SUB TOTAL ${input.subTotal}`);
  drawLine(page1, `TOTAL ${input.total}`);

  const page2 = pdfDoc.addPage(PAGE_SIZE);
  y = TOP_Y;
  for (const row of input.categoryRows) {
    drawLine(page2, row);
  }

  const bytes = await pdfDoc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
