/**
 * 이력서 첨부 자료 텍스트 추출 API — 두 가지 입력 방식 지원.
 *
 * 1) multipart/form-data with `file` 필드 (작은 파일 — Vercel 4.5MB 제한 안)
 *    POST /api/resume/extract
 *      body: FormData { file }
 *
 * 2) application/json with blob URL (큰 파일 — Vercel Blob 직접 업로드 후 URL 전달)
 *    POST /api/resume/extract
 *      body: { url: string, filename: string }
 *      서버가 url에서 받아 처리하고, 처리 후 blob을 삭제(임시 파일 정리).
 *
 *   200 : { text, filename, bytes }
 *   400 : { error }
 *   500 : { error }
 *
 * 지원: hwp/hwpx/docx/pptx/xlsx (Polaris) + pdf (pdf-parse)
 * 환경변수: POLARIS_DATAINSIGHT_API_KEY, BLOB_READ_WRITE_TOKEN(blob URL 모드 시)
 */

import { NextResponse } from "next/server";
import { extractText } from "@/lib/extract/dispatch";
import { del } from "@vercel/blob";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const ct = req.headers.get("content-type") ?? "";

  // ──── 1) JSON: { url, filename } — Vercel Blob 경유 ────
  if (ct.includes("application/json")) {
    let body: { url?: string; filename?: string };
    try {
      body = (await req.json()) as { url?: string; filename?: string };
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const url = (body.url ?? "").trim();
    const filename = (body.filename ?? "").trim();
    if (!url || !filename) {
      return NextResponse.json(
        { error: "url, filename 필수" },
        { status: 400 },
      );
    }
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        return NextResponse.json(
          { error: `blob fetch ${resp.status}`, filename, bytes: 0 },
          { status: 502 },
        );
      }
      const buf = Buffer.from(await resp.arrayBuffer());
      const bytes = buf.byteLength;
      const { text } = await extractText(buf, filename);
      // 추출이 끝났으니 임시 blob 삭제 (best-effort)
      try {
        await del(url);
      } catch {
        // 삭제 실패는 무시 — 데이터 노출 영향 없음 (파일 자체는 단명 사용)
      }
      return NextResponse.json({ text, filename, bytes });
    } catch (e) {
      return NextResponse.json(
        {
          error: String((e as Error).message ?? e),
          filename,
          bytes: 0,
        },
        { status: 500 },
      );
    }
  }

  // ──── 2) multipart/form-data — 기존 방식 (~4.5MB 한정) ────
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
