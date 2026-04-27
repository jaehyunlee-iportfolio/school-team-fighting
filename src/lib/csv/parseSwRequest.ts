/**
 * D-3 소프트웨어활용비 CSV 파서.
 *
 * 구조 (실측):
 *   R1: 시트 제목 ("D-3.소프트웨어활용비")
 *   R2: 담당자명/필수증빙 라벨
 *   R3: 컬럼 헤더 (사용일자/집행일자/거래처/지출금액/.../비고/.../비고(증빙번호)/...)
 *   R4: 일부 컬럼의 추가 라벨 (병합 헤더)
 *   R5~ : 데이터. "소계" 행 만나면 종료.
 *
 * 핵심 컬럼 인덱스: 11=비고(텍스트), 15=비고(증빙번호)
 *
 * 비고 텍스트 형식:
 *   "• 인천갈월초: Padlet(2개/240,000원/6개월), zepp Quiz(2개/280,000원/5개월)\n• 서울방송고: Chat GPT Plus(1개/240,000원/5개월)"
 *   콜론이 없는 변형: "• 클래스팅 AI 패키지(40개/1,000,000원)"  ← 학교명 없음
 *
 * 한 행에 학교 N개 → N개의 SwRequestRow 로 펼침. evidenceNo 공유.
 */

import Papa from "papaparse";
import type { SwLineItem, SwRequestRow } from "@/lib/sw/types";

const COL_BIGO = 11;
const COL_EVIDENCE_NO = 15;

const HEADER_ROW_INDEX = 2;   // R3 (0-based 2)
const DATA_START_INDEX = 4;   // R5

const SUMMARY_TOKENS = ["소계", "합계", "<정의>"];

function isDataRow(row: string[]): boolean {
  if (!row || row.length === 0) return false;
  const c0 = (row[0] ?? "").trim();
  if (!c0) return false;
  if (SUMMARY_TOKENS.some((t) => c0.startsWith(t))) return false;
  // 사용일자가 날짜 형태인지 약식 체크
  return /\d/.test(c0);
}

/**
 * 비고 한 줄(불릿 1개 분량)을 파싱.
 * "인천갈월초: Padlet(2개/240,000원/6개월), zepp Quiz(2개/280,000원/5개월)"
 *   → school="인천갈월초", items=[{product:"Padlet", qty:"2개", period:"6개월"}, ...]
 */
function parseBulletLine(line: string): { school: string; items: SwLineItem[] } | null {
  const stripped = line.replace(/^[\s•·▪‣◦●◯■□▶▷▸▹\-—–]+/, "").trim();
  if (!stripped) return null;

  let school = "";
  let rest = stripped;
  const colonMatch = stripped.match(/^([^:：]+?)\s*[:：]\s*(.+)$/);
  if (colonMatch) {
    school = colonMatch[1].trim();
    rest = colonMatch[2].trim();
  }

  // SW들을 콤마로 분리 — 단, 괄호 안 콤마는 살려야 하므로 괄호 깊이 추적
  const segments: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of rest) {
    if (ch === "(" || ch === "（") depth++;
    else if (ch === ")" || ch === "）") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      if (buf.trim()) segments.push(buf.trim());
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) segments.push(buf.trim());

  const items: SwLineItem[] = segments
    .map((seg) => parseProductSegment(seg))
    .filter((x): x is SwLineItem => !!x);

  if (items.length === 0) return null;
  return { school, items };
}

/**
 * "Padlet(2개/240,000원/6개월)" → { product:"Padlet", quantity:"2개", period:"6개월" }
 * 슬래시 구분 토큰 중 "N개" → quantity, "M개월"/"M년" 등 → period, 나머지(금액)는 무시
 */
function parseProductSegment(seg: string): SwLineItem | null {
  const m = seg.match(/^(.+?)\s*\(\s*(.+?)\s*\)\s*$/);
  let product: string;
  let inner: string | null;
  if (m) {
    product = m[1].trim();
    inner = m[2].trim();
  } else {
    product = seg.trim();
    inner = null;
  }
  if (!product) return null;

  let quantity = "";
  let period = "";
  if (inner) {
    const tokens = inner.split("/").map((t) => t.trim());
    for (const t of tokens) {
      if (/개월$|년$|주$|일$/.test(t) && /\d/.test(t)) {
        period = t;
      } else if (/개$/.test(t) && /\d/.test(t)) {
        quantity = t;
      }
    }
  }

  return {
    user: "",
    product,
    quantity,
    period,
    warnings: [],
  };
}

export type SwRequestParseResult = {
  rows: SwRequestRow[];
  /** 행 단위 라우팅용: 같은 evidenceNo 가 여러 학교로 펼쳐졌는지 추적 */
  totalSourceRows: number;
};

export function parseSwRequestCsv(text: string): SwRequestParseResult {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false });
  const rows: string[][] = (parsed.data as unknown as string[][]).filter(
    (r): r is string[] => Array.isArray(r),
  );

  if (rows.length <= HEADER_ROW_INDEX) {
    return { rows: [], totalSourceRows: 0 };
  }

  const out: SwRequestRow[] = [];
  let rowIndex = 0;
  let totalSourceRows = 0;

  for (let i = DATA_START_INDEX; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (!isDataRow(row)) continue;
    totalSourceRows += 1;

    const bigoText = (row[COL_BIGO] ?? "").trim();
    const evidenceNo = (row[COL_EVIDENCE_NO] ?? "").trim();
    if (!bigoText) {
      // 비고가 비어있으면 1개 placeholder 행 생성 → 사용자 검토에서 입력
      out.push(emptyRow(rowIndex++, evidenceNo));
      continue;
    }

    const lines = bigoText.split(/\r?\n+/).map((s) => s.trim()).filter(Boolean);
    const parsedLines = lines.map(parseBulletLine).filter((x): x is { school: string; items: SwLineItem[] } => !!x);

    if (parsedLines.length === 0) {
      out.push(emptyRow(rowIndex++, evidenceNo));
      continue;
    }

    for (const pl of parsedLines) {
      const fieldWarnings: string[] = [];
      if (!pl.school) fieldWarnings.push("학교명 누락 (비고에 콜론 없음)");

      out.push({
        rowIndex: rowIndex++,
        evidenceNo,
        schoolRaw: pl.school,
        schoolName: pl.school,
        applicantName: "",
        applicantPhone: "",
        applicantTarget: "",
        quoteDateRaw: "",
        quoteYymmdd: "",
        quoteY: "",
        quoteM: "",
        quoteD: "",
        items: pl.items,
        hasEmpty: !pl.school,
        fieldWarnings,
      });
    }
  }

  return { rows: out, totalSourceRows };
}

function emptyRow(rowIndex: number, evidenceNo: string): SwRequestRow {
  return {
    rowIndex,
    evidenceNo,
    schoolRaw: "",
    schoolName: "",
    applicantName: "",
    applicantPhone: "",
    applicantTarget: "",
    quoteDateRaw: "",
    quoteYymmdd: "",
    quoteY: "",
    quoteM: "",
    quoteD: "",
    items: [],
    hasEmpty: true,
    fieldWarnings: ["비고 비어있음 — 직접 입력 필요"],
  };
}
