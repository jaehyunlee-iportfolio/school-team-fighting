// PDF 텍스트 추출 — pdf-parse v2 (PDFParse 클래스).

import { PDFParse } from "pdf-parse";

export function isPdfExt(filename: string): boolean {
  return filename.toLowerCase().endsWith(".pdf");
}

export async function extractFromPdf(
  buf: Buffer | Uint8Array,
): Promise<{ text: string }> {
  const nodeBuf = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const parser = new PDFParse({ data: nodeBuf });
  const r = await parser.getText();
  return { text: (r.text ?? "").normalize("NFC") };
}
