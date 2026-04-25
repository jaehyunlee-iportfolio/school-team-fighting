/**
 * PDF 시각적 테스트 스크립트
 * Usage: npx tsx scripts/test-pdf-visual.tsx
 *
 * 1. @react-pdf/renderer로 PDF를 생성
 * 2. pdf-to-img로 PNG 이미지 변환
 * 3. assets/Mock PDF Image/generated.png 에 저장
 */

import { renderToBuffer } from "@react-pdf/renderer";
import { Font } from "@react-pdf/renderer";
import { pdf } from "pdf-to-img";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BusinessTripDocument } from "../src/components/pdf/business-trip-document";
import type { TripRow } from "../src/lib/csv/parseD4";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

Font.register({
  family: "Pretendard",
  fonts: [
    { src: resolve(ROOT, "public/fonts/Pretendard-Regular.otf"), fontWeight: 400 },
    { src: resolve(ROOT, "public/fonts/Pretendard-Medium.otf"), fontWeight: 500 },
    { src: resolve(ROOT, "public/fonts/Pretendard-SemiBold.otf"), fontWeight: 600 },
    { src: resolve(ROOT, "public/fonts/Pretendard-Bold.otf"), fontWeight: 700 },
    { src: resolve(ROOT, "public/fonts/Pretendard-ExtraBold.otf"), fontWeight: 800 },
    { src: resolve(ROOT, "public/fonts/Pretendard-Black.otf"), fontWeight: 900 },
  ],
});
const mockRow: TripRow = {
  rowIndex: 0,
  usageDate: "2025. 7. 5",
  partnerRaw: "채영지",
  orgName: "(주)아이포트폴리오",
  outPlace: "천안아산",
  payMethod: "카드",
  detail: "건국대사업단 디지털교육 콘텐츠 개발 출장",
  writerName: "채영지",
  nameSource: "georae",
  drafter3: "채영지",
  memberText: "채영지",
  periodText: "2025. 7. 5 ~ 2025. 7. 5",
  purposeText: "건국대사업단 디지털교육 콘텐츠 개발 출장",
  evidenceNo: "D-4-1",
  orgGroup: "ipf",
  approver1: "팀장",
  approver2: "본부장",
  hasEmpty: false,
  fieldWarnings: [],
  approvalGroupOverride: "auto",
};

async function main() {
  console.log("Rendering PDF...");
  const pdfBuffer = await renderToBuffer(
    <BusinessTripDocument row={mockRow} />
  );
  
  const pdfPath = resolve(ROOT, "assets/Mock PDF Image/generated.pdf");
  writeFileSync(pdfPath, pdfBuffer);
  console.log(`PDF saved: ${pdfPath}`);

  console.log("Converting PDF to PNG...");
  const doc = await pdf(pdfBuffer, { scale: 2 });
  const page1 = await doc.getPage(1);

  const pngPath = resolve(ROOT, "assets/Mock PDF Image/generated.png");
  writeFileSync(pngPath, page1);
  console.log(`PNG saved: ${pngPath}`);
  console.log("Done!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
