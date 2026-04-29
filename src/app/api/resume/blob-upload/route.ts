/**
 * Vercel Blob 직접 업로드용 토큰 발급 라우트.
 *
 * POST /api/resume/blob-upload
 *   클라이언트 SDK(@vercel/blob/client)의 `upload()` 가 호출하는 토큰 핸들러.
 *   브라우저가 4.5MB Vercel 함수 body 제한을 우회하여 Blob 스토리지에 직접 업로드.
 *
 * 환경변수: BLOB_READ_WRITE_TOKEN (Vercel Blob 활성화 후 자동 생성)
 *
 * 보안:
 *   - 25MB 상한 (Polaris/pdfjs 처리 한계)
 *   - 지원 확장자만 허용
 */

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SUPPORTED_EXTS = [".hwp", ".hwpx", ".docx", ".pptx", ".xlsx", ".pdf"];

export async function POST(request: Request): Promise<NextResponse> {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const lower = pathname.toLowerCase();
        if (!SUPPORTED_EXTS.some((ext) => lower.endsWith(ext))) {
          throw new Error(
            `지원하지 않는 확장자: ${pathname}. (지원: ${SUPPORTED_EXTS.join(", ")})`,
          );
        }
        return {
          allowedContentTypes: undefined,
          addRandomSuffix: true,
          maximumSizeInBytes: 25 * 1024 * 1024,
        };
      },
      onUploadCompleted: async () => {
        // 추출 라우트가 업로드 후 blob 을 다시 fetch해서 처리.
        // 임시 파일 정리는 추출 라우트에서 수행.
      },
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message ?? "blob upload error" },
      { status: 400 },
    );
  }
}
