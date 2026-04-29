/**
 * 운영회의록 자동화 mock 테스트.
 * 실행: npx tsx scripts/test-meeting-operations.tsx
 *
 * 시나리오 5개를 mock CSV → 파서 → PDF 렌더 까지 돌려보고
 * 각 단계에서 throw 없이 PDF Buffer 가 생성되는지 확인.
 */

import { renderToBuffer, Font } from "@react-pdf/renderer";
import { resolve } from "node:path";
import {
  parseMeetingOperationsCsv,
} from "../src/lib/csv/parseMeetingOperations";

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
import {
  MeetingOperationsDocument,
  makeMeetingOperationsFilename,
} from "../src/components/pdf/meeting-operations-document";
import {
  DEFAULT_MEETING_OP_SETTINGS,
  DEFAULT_MEETING_OP_LAYOUT,
} from "../src/lib/firebase/firestore";
import {
  effectiveValue,
  hasConflict,
  parseAttendees,
} from "../src/lib/meeting/types";
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.join(__dirname, "..", "tmp_test_output");
fs.mkdirSync(OUT_DIR, { recursive: true });

type Scenario = {
  name: string;
  csv: string;
  expectRows: number;
  expectGroupSize?: number[];
  withPhotos?: boolean;
};

// 1x1 transparent PNG (data URL) — mock photo
const MOCK_PHOTO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const scenarios: Scenario[] = [
  {
    name: "01_정상_단일행",
    csv: `증빙번호,일 시,시 간,장 소,작성자,회의 안건 / 목적,회의 내용,결정 및 협의사항,향후 일정,참석자
D-2-1,2025년 7월 28일,10:30~12:30,iPortfolio 사내 회의실,채영지,플랫폼 운영 점검,플랫폼 운영 현황을 점검하고 강사풀 관리 자문을 받았다.,강사풀 표준화 / 기술지원 보완 / 학교별 협의 절차 정비,강사 등록 갱신 / 매뉴얼 작성 / 협의 절차 가이드 배포,"장인선, 채영지, 홍수민, 임성경, 안석진, 김유, 박지예, 박관석, 조연주, 이영규, 이창환, 이정은"`,
    expectRows: 1,
  },
  {
    name: "02_빈필드_작성자누락",
    csv: `증빙번호,일 시,시 간,장 소,작성자,회의 안건 / 목적,회의 내용,결정 및 협의사항,향후 일정,참석자
D-2-99,,,,,,,,,
D-2-100,2025년 8월 1일,14:00~16:00,회의실 A,,논의,논의 진행함,결정사항 없음,,"홍길동, 김영희"`,
    expectRows: 1,
  },
  {
    name: "03_충돌그룹_같은회의_2건결제",
    csv: `증빙번호,일 시,시 간,장 소,작성자,회의 안건 / 목적,회의 내용,결정 및 협의사항,향후 일정,참석자
D-2-1,2025년 9월 15일,13:00~15:00,iPortfolio 사내 회의실,채영지,1차 안건,1차 회의 내용,결정 사항 A,일정 1,"장인선, 채영지, 홍수민"
D-2-13,2025년 9월 15일,13:00~15:00,iPortfolio 사내 회의실,장인선,1차 안건 (수정),1차 회의 내용 보강,결정 사항 A 및 B,일정 1과 2,"장인선, 채영지, 홍수민, 박관석"`,
    expectRows: 1,
    expectGroupSize: [2],
  },
  {
    name: "04_많은참석자_서명부분할",
    csv: `증빙번호,일 시,시 간,장 소,작성자,회의 안건 / 목적,회의 내용,결정 및 협의사항,향후 일정,참석자
D-2-77,2025년 10월 3일,09:00~11:00,세미나실,홍길동,대규모 회의,참석자 25명 회의,사항,후속,"A1, A2, A3, A4, A5, A6, A7, A8, A9, A10, A11, A12, A13, A14, A15, A16, A17, A18, A19, A20, A21, A22, A23, A24, A25"`,
    expectRows: 1,
  },
  {
    name: "05_사진6장_포함",
    csv: `증빙번호,일 시,시 간,장 소,작성자,회의 안건 / 목적,회의 내용,결정 및 협의사항,향후 일정,참석자
D-2-200,2025년 11월 11일,15:00~16:00,온라인,김작성,온라인 회의,화상 회의 진행,결정,일정,"홍길동, 이영희, 박철수"`,
    expectRows: 1,
    withPhotos: true,
  },
];

async function run() {
  let pass = 0;
  let fail = 0;
  for (const sc of scenarios) {
    process.stdout.write(`▶ ${sc.name} ... `);
    try {
      // 1. 파싱
      const parsed = parseMeetingOperationsCsv(sc.csv);
      if (parsed.rows.length !== sc.expectRows) {
        throw new Error(
          `expected ${sc.expectRows} rows, got ${parsed.rows.length}`,
        );
      }
      if (sc.expectGroupSize) {
        for (let i = 0; i < sc.expectGroupSize.length; i++) {
          const got = parsed.rows[i].evidenceNos.length;
          if (got !== sc.expectGroupSize[i]) {
            throw new Error(
              `row[${i}] expected ${sc.expectGroupSize[i]} evidenceNos, got ${got}`,
            );
          }
        }
      }

      // 2. 사진 첨부
      if (sc.withPhotos) {
        parsed.rows[0].photos = Array.from({ length: 6 }, () => MOCK_PHOTO);
      }

      // 3. PDF 렌더 (실제 throw 잡는 핵심 단계)
      const row = parsed.rows[0];
      const buffer = await renderToBuffer(
        MeetingOperationsDocument({
          row,
          settings: DEFAULT_MEETING_OP_SETTINGS,
          layout: DEFAULT_MEETING_OP_LAYOUT,
        }),
      );

      // 4. 저장 (육안 확인용)
      const fname = makeMeetingOperationsFilename(
        row,
        row.evidenceNos[0],
        DEFAULT_MEETING_OP_SETTINGS,
      );
      const outPath = path.join(OUT_DIR, `${sc.name}__${fname}`);
      fs.writeFileSync(outPath, buffer);

      // 5. 메타 출력
      const conflicts: string[] = [];
      if (hasConflict(row.agenda)) conflicts.push("agenda");
      if (hasConflict(row.content)) conflicts.push("content");
      if (hasConflict(row.author)) conflicts.push("author");
      const meta = [
        `rows=${parsed.rows.length}`,
        `ev=[${row.evidenceNos.join(",")}]`,
        `ymd=${row.dateYymmdd || "-"}`,
        `attendees=${parseAttendees(effectiveValue(row.attendees)).length}`,
        `photos=${row.photos.length}`,
        conflicts.length ? `conflicts=${conflicts.join("|")}` : "",
        `pdf=${buffer.length}B`,
      ]
        .filter(Boolean)
        .join(" / ");
      console.log(`✓ ${meta}`);
      pass++;
    } catch (e) {
      console.log(`✗ ${(e as Error).message}`);
      console.error("  stack:", (e as Error).stack?.split("\n").slice(0, 4).join("\n  "));
      fail++;
    }
  }
  console.log(`\n[결과] pass ${pass} / fail ${fail}`);
  console.log(`출력: ${OUT_DIR}`);
  process.exit(fail === 0 ? 0 : 1);
}

void run();
