// 확장자 기반 텍스트 추출 디스패처.
// 서버 사이드 전용 (API route handler에서 호출).

import { extractWithPolaris, isPolarisExt } from "@/lib/extract/polaris";
import { extractFromPdf, isPdfExt } from "@/lib/extract/pdf";

export type ExtractError =
  | { kind: "unsupported"; filename: string }
  | { kind: "tooLarge"; filename: string; size: number }
  | { kind: "remote"; filename: string; message: string };

export async function extractText(
  buf: Buffer | Uint8Array,
  filename: string,
): Promise<{ text: string }> {
  if (isPdfExt(filename)) {
    return extractFromPdf(buf);
  }
  if (isPolarisExt(filename)) {
    return extractWithPolaris(buf, filename);
  }
  throw new Error(
    `지원하지 않는 확장자입니다: ${filename}. (지원: hwp/hwpx/docx/pptx/xlsx/pdf)`,
  );
}
