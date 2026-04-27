/**
 * [건국대] 학교별 에듀테크 견적서 및 세부사항.xlsx 파서.
 *
 * 시트당 구조 (실측):
 *   R1: "견   적   서"
 *   R3 C3: 학교명 (수신)  ← 시트명을 학교명으로 쓰는 게 더 안전
 *   R5 C3: 견적일자 (예: "2025 년 09 월 25 일")
 *   R13: 헤더 (No / 품목명 및 규격 / 수량 / 개월 / 단 가 / 출고금액)
 *   R14~: 데이터. No 또는 품목명 비면 종료
 *
 * 메타 시트 제외: 종합, 작성방법 및 주의사항, 예시(복사O), 양식, 시트6, 단가표
 */

import * as XLSX from "xlsx";
import { normalizeSchoolName } from "@/lib/school/normalize";
import type {
  QuoteSheet,
  QuoteSheetItem,
  QuoteSheetUser,
} from "@/lib/sw/types";

const META_SHEET_NAMES = new Set([
  "종합",
  "작성방법 및 주의사항",
  "예시(복사O)",
  "양식",
  "시트6",
  "단가표",
]);

const HEADER_ROW = 13;        // 1-based
const DATA_START_ROW = 14;    // 1-based
const MAX_DATA_ROW = 60;      // safety cap

// 좌측 견적서 표
const COL_NO = 1;
const COL_PRODUCT = 2;
const COL_QTY = 7;
const COL_MONTH = 9;

// 우측 사용자 명단
const COL_LIST_NO = 15;       // O — "No." (값 "예시"면 skip)
const COL_LIST_NAME = 16;     // P — "이름"
const COL_LIST_PHONE = 17;    // Q — "연락처"
const COL_LIST_PERIOD = 21;   // U — "실제 구독일자(기간)" 또는 "신청 에듀테크"

const QUOTE_DATE_ROW = 5;
const QUOTE_DATE_COL = 3;

function cellText(ws: XLSX.WorkSheet, r: number, c: number): string {
  const addr = XLSX.utils.encode_cell({ r: r - 1, c: c - 1 });
  const cell = ws[addr];
  if (!cell) return "";
  if (cell.w !== undefined) return String(cell.w).trim();
  if (cell.v === null || cell.v === undefined) return "";
  if (cell.v instanceof Date) {
    const d = cell.v;
    return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
  }
  return String(cell.v).trim();
}

function cellNumber(ws: XLSX.WorkSheet, r: number, c: number): number | null {
  const addr = XLSX.utils.encode_cell({ r: r - 1, c: c - 1 });
  const cell = ws[addr];
  if (!cell || cell.v === null || cell.v === undefined) return null;
  if (typeof cell.v === "number") return cell.v;
  const n = parseFloat(String(cell.v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseSheet(ws: XLSX.WorkSheet, sheetName: string): QuoteSheet {
  const quoteDateRaw = cellText(ws, QUOTE_DATE_ROW, QUOTE_DATE_COL);

  // 좌측 견적서 표
  const items: QuoteSheetItem[] = [];
  for (let r = DATA_START_ROW; r <= MAX_DATA_ROW; r++) {
    const product = cellText(ws, r, COL_PRODUCT);
    const noText = cellText(ws, r, COL_NO);
    if (!product && !noText) break;
    if (!product) continue;
    const qtyN = cellNumber(ws, r, COL_QTY);
    const monthN = cellNumber(ws, r, COL_MONTH);
    items.push({
      product,
      quantity: qtyN === null ? "" : String(Math.round(qtyN)),
      period: monthN === null ? "" : `${Math.round(monthN)}개월`,
    });
  }

  // 우측 사용자 명단 — U13 헤더로 기간/SW명 분기
  const periodHeader = cellText(ws, HEADER_ROW, COL_LIST_PERIOD);
  const periodCellIsDate = /실제|기간/.test(periodHeader);

  const users: QuoteSheetUser[] = [];
  for (let r = DATA_START_ROW; r <= MAX_DATA_ROW; r++) {
    const name = cellText(ws, r, COL_LIST_NAME);
    const noText = cellText(ws, r, COL_LIST_NO);
    if (!name) {
      // 이름 비면 종료. 단 빈 row 사이에 더 있을 수 있으니 다음 1행만 더 봐서 둘 다 비면 정말 끝
      const nextName = cellText(ws, r + 1, COL_LIST_NAME);
      if (!nextName) break;
      continue;
    }
    // "예시" 행 skip
    if (/^예시/.test(noText) || /^예시/.test(name)) continue;
    const phone = cellText(ws, r, COL_LIST_PHONE);
    const periodCell = cellText(ws, r, COL_LIST_PERIOD);
    users.push({ name, phone, periodCell });
  }

  return { sheetName, quoteDateRaw, items, users, periodCellIsDate };
}

export type QuoteWorkbookResult = {
  /** 시트명(원문) → QuoteSheet */
  bySheetName: Map<string, QuoteSheet>;
  /** 정규화된 학교명 → QuoteSheet */
  byNorm: Map<string, QuoteSheet>;
  /** 풀네임(시트명) 후보 */
  fullNames: string[];
};

export async function parseQuoteWorkbookFile(
  file: File,
): Promise<QuoteWorkbookResult> {
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab, { type: "array", cellDates: true });
  const bySheetName = new Map<string, QuoteSheet>();
  const byNorm = new Map<string, QuoteSheet>();
  const fullNames: string[] = [];

  for (const name of wb.SheetNames) {
    if (META_SHEET_NAMES.has(name)) continue;
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const sheet = parseSheet(ws, name);
    bySheetName.set(name, sheet);
    const norm = normalizeSchoolName(name);
    if (norm) byNorm.set(norm, sheet);
    fullNames.push(name);
  }

  return { bySheetName, byNorm, fullNames };
}

/**
 * 견적일자 텍스트("2025 년 09 월 25 일", "2026 년 02월 01일", "2025 년 11 월  3일")를
 * { y, m, d, yymmdd } 로 정규화. 실패 시 모두 빈 문자열.
 */
export function parseQuoteDate(raw: string): {
  y: string;
  m: string;
  d: string;
  yymmdd: string;
} {
  if (!raw) return { y: "", m: "", d: "", yymmdd: "" };
  const m = raw.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (!m) return { y: "", m: "", d: "", yymmdd: "" };
  const y = m[1];
  const mo = String(parseInt(m[2], 10));
  const d = String(parseInt(m[3], 10));
  const yy = y.slice(-2);
  const moPad = mo.padStart(2, "0");
  const dPad = d.padStart(2, "0");
  return { y, m: mo, d, yymmdd: `${yy}${moPad}${dPad}` };
}
