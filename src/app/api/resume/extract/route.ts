/**
 * 이력서 첨부 자료 텍스트 추출 API.
 *
 * POST /api/resume/extract
 *   body: multipart/form-data with field `file`
 *   200 : { text: string, filename: string, bytes: number }
 *   400 : { error: string }
 *   500 : { error: string }
 *
 * 지원: hwp/hwpx/docx/pptx/xlsx (Polaris) + pdf (pdfjs)
 * 환경변수: POLARIS_DATAINSIGHT_API_KEY (hwp/docx 등에 필요)
 */

import { NextResponse } from "next/server";
import { extractText } from "@/lib/extract/dispatch";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "multipart/form-data 가 아닙니다" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "file 필드가 비어있습니다" },
      { status: 400 },
    );
  }

  const filename = file.name;
  const bytes = file.size;
  if (!filename) {
    return NextResponse.json({ error: "파일명 없음" }, { status: 400 });
  }
  if (bytes === 0) {
    return NextResponse.json(
      { error: "파일 크기가 0입니다" },
      { status: 400 },
    );
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const { text } = await extractText(buf, filename);
    return NextResponse.json({ text, filename, bytes });
  } catch (e) {
    return NextResponse.json(
      { error: String((e as Error).message ?? e), filename, bytes },
      { status: 500 },
    );
  }
}
