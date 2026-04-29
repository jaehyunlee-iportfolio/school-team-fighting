/**
 * D-4 출장비 CSV 파서 — v2 (2026-04 신규 형식).
 *
 * v1 와 차이:
 * ─────────────────────────────────────────────────
 * | 필드          | v1                            | v2 (현재)                    |
 * ─────────────────────────────────────────────────
 * | 거래처        | 출장자 명단 (예: "안석진")     | 가게/업체명 (예: "CU 인천항")  |
 * | 출장자        | 거래처 컬럼                   | 사용내역 "1. 출장자명(...)"   |
 * | 출장지        | 산출내역 마지막 "- /...."      | 사용내역 "3. 출장지: ..."    |
 * | 출장 목적     | 산출내역 마지막 라인 앞부분    | 사용내역 "2. 산출내역 및 ..." |
 *
 * 사용내역(수령인) 형식 예:
 *   1. 출장자명(안석진, 임성경, 박지예)
 *   2. 산출내역 및 출장내용
 *   - 8/9~8/11 연수 (식대/다과비_단가: 2,933원, 인원 3명)
 *   3. 출장지: 대청초
 *
 * 헤더 구조(상+하 2행), 컬럼 키, 그 외 보조 함수는 v1 와 동일하게 재사용.
 */

import type { ParseError } from "papaparse";
import Papa from "papaparse";

import { drafterSignatureGraphemes } from "@/lib/names/parseName";
import { getApprovalHeaderLabels, type ApprovalGroup } from "@/lib/approval/labels";
import { parseExpenseLines } from "@/lib/trip/expense";
import {
  buildMergedHeaderKeys,
  type DatePlaceholders,
  type TripRow,
} from "@/lib/csv/parseD4";

function nfc(s: string | undefined | null): string {
  return s == null ? "" : s.normalize("NFC");
}

function norm(s: string | undefined | null): string {
  if (s == null) return "";
  return s
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type KeyCol = { key: string; index: number };

function toKeyCol(keys: string[]): KeyCol[] {
  return keys.map((key, index) => ({ key, index }));
}

function getByRe(row: string[], kcols: KeyCol[], re: RegExp): string {
  for (const { key, index } of kcols) {
    if (re.test(key)) return nfc(row[index]);
  }
  return "";
}

function getMainUsageDetail(row: string[], kcols: KeyCol[]): string {
  for (const { key, index } of kcols) {
    if (key.includes("사용내역") && key.includes("수령") && !key.toUpperCase().includes("RAW")) {
      return nfc(row[index]);
    }
  }
  for (const { key, index } of kcols) {
    if (/사용내역|수령/.test(key)) return nfc(row[index]);
  }
  return "";
}

/** v2 사용내역(수령인) 텍스트 → 출장자/산출내역 본문/출장지 분리 */
export function extractV2UsageDetail(detail: string): {
  partners: string[];
  partnerRaw: string;
  purpose: string;
  outPlace: string;
} {
  if (!detail) return { partners: [], partnerRaw: "", purpose: "", outPlace: "" };

  const lines = detail.split(/\r?\n/);

  // 1) 출장자명: "1. 출장자명(이름1, 이름2, ...)"
  let partnerRaw = "";
  let partners: string[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*1\.\s*출장자\s*명\s*\(([^)]*)\)/);
    if (m) {
      partnerRaw = m[1].trim();
      partners = partnerRaw
        .split(/\s*,\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
      break;
    }
  }

  // 2) 출장지: "3. 출장지: ..." — 콜론 뒤 끝까지 (한 줄 가정)
  let outPlace = "";
  for (const line of lines) {
    const m = line.match(/^\s*3\.\s*출장지\s*[:：]\s*(.*)$/);
    if (m) {
      outPlace = m[1].trim();
      break;
    }
  }

  // 3) 산출내역 본문 (purpose):
  //    "2. 산출내역 및 출장내용" 다음 줄부터, 그 다음 "3. " 또는 "1. " 만나기 전까지의 줄들.
  let purposeStart = -1;
  let purposeEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*2\.\s*산출내역/.test(lines[i])) {
      purposeStart = i + 1;
      break;
    }
  }
  if (purposeStart >= 0) {
    for (let i = purposeStart; i < lines.length; i++) {
      if (/^\s*[13]\.\s/.test(lines[i])) {
        purposeEnd = i;
        break;
      }
    }
  }
  let purpose = "";
  if (purposeStart >= 0) {
    purpose = lines
      .slice(purposeStart, purposeEnd)
      .map((l) => l.trim())
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  return { partners, partnerRaw, purpose, outPlace };
}

const DATE_ISO = /^\d{4}-[0-1]?\d-[0-3]?\d$/;
const DATE_KR = /^\d{4}\.\s*\d{1,2}\.\s*\d{1,2}/;
const DATE_RANGE_KR = /^\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\s*~\s*\d{4}\.\s*\d{1,2}\.\s*\d{1,2}/;

function toKoreanDateFormat(raw: string): string {
  const s = raw.trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}. ${Number(iso[2])}. ${Number(iso[3])}`;
  const kr = s.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (kr) return `${kr[1]}. ${Number(kr[2])}. ${Number(kr[3])}`;
  return s;
}

const LOOKS_LIKE_DATE = /\d{4}[\s.\-/]+\d{1,2}[\s.\-/]+\d{1,2}/;

const DEFAULT_DATE_PH: DatePlaceholders = {
  dateFallback: "YYYY. MM. DD",
  dateInvalid: "날짜 확인 불가",
};

function normalizeUsageDate(raw: string, ph: DatePlaceholders = DEFAULT_DATE_PH): {
  periodText: string;
  invalidDate: boolean;
} {
  const trimmed = norm(raw);
  if (!trimmed) return { periodText: "", invalidDate: false };
  if (trimmed.includes("~")) {
    const [left, right] = trimmed.split("~").map((s) => s.trim());
    const leftOk = LOOKS_LIKE_DATE.test(left);
    const rightOk = LOOKS_LIKE_DATE.test(right);
    if (leftOk && rightOk) {
      return {
        periodText: `${toKoreanDateFormat(left)} ~ ${toKoreanDateFormat(right)}`,
        invalidDate: false,
      };
    }
    if (leftOk) {
      return {
        periodText: `${toKoreanDateFormat(left)} ~ ${ph.dateFallback}`,
        invalidDate: false,
      };
    }
    return { periodText: ph.dateInvalid, invalidDate: true };
  }
  if (!LOOKS_LIKE_DATE.test(trimmed)) return { periodText: ph.dateInvalid, invalidDate: true };
  const formatted = toKoreanDateFormat(trimmed);
  return { periodText: `${formatted} ~ ${formatted}`, invalidDate: false };
}

function isDataRow(row: string[]): boolean {
  if (row.every((c) => !norm(c))) return false;
  for (const cell of row.slice(0, 2)) {
    const t = norm(cell);
    if (DATE_ISO.test(t) || DATE_KR.test(t) || DATE_RANGE_KR.test(t)) return true;
  }
  for (const cell of row) {
    const t = norm(cell);
    if (
      t.length > 1 &&
      t !== "FALSE" &&
      t !== "TRUE" &&
      t !== "O" &&
      t !== "X" &&
      t !== "해당없음" &&
      /D-4/i.test(t)
    )
      return true;
  }
  return row.some(
    (c) =>
      /[가-힣]{2,}/.test(norm(c)) && norm(c).length > 1 && !/^영수증\s*없음$/.test(norm(c))
  );
}

function parseAmount(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/[^\d-]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function rowToTripV2(
  i: number,
  row: string[],
  kcols: KeyCol[],
  datePh?: DatePlaceholders,
): TripRow {
  const merchant = getByRe(row, kcols, /^거래처$|거래처/); // v2 에선 가게명
  const detail = getMainUsageDetail(row, kcols);
  const o = getByRe(row, kcols, /집행.*기관/);
  const u = getByRe(row, kcols, /사용일자/);
  const evidenceRaw = getByRe(row, kcols, /비고|증빙/);
  const evidenceMatch = evidenceRaw.match(/[A-Za-z]-\d+(?:-\d+)*/);
  const evidenceNo = evidenceMatch ? evidenceMatch[0] : "";

  // v2 핵심: 사용내역에서 출장자/목적/출장지 모두 추출
  const { partners, partnerRaw, purpose, outPlace } = extractV2UsageDetail(detail);

  // 작성자: v2 에선 거래처가 사람명이 아니므로 첫 출장자를 작성자로 사용
  const writerName = partners[0] ?? "";
  const nameSource: TripRow["nameSource"] = writerName ? "georae" : "none";

  const labels = getApprovalHeaderLabels(o, "auto");
  const { periodText, invalidDate } = normalizeUsageDate(u, datePh);

  const totalRaw = getByRe(row, kcols, /^합계금액$/);
  const totalAmount = parseAmount(totalRaw);
  const expenseLines = parseExpenseLines(detail, totalAmount);

  const wlist: string[] = [];
  if (!writerName) wlist.push("출장자가 비어있어요 — 사용내역의 \"1. 출장자명(...)\" 라인을 확인하세요");
  if (!norm(detail)) wlist.push("「사용내역(수령인)」이 비어 있어요");
  if (!purpose) wlist.push("「출장 목적」을 추출하지 못함 — \"2. 산출내역 및 출장내용\" 아래 라인이 있는지 확인하세요");
  if (!outPlace) wlist.push("「출장지」를 추출하지 못함 — \"3. 출장지: ...\" 라인이 있는지 확인하세요");
  if (!norm(o)) wlist.push("「집행기관(명)」이 비어 있어요");
  if (!norm(u)) wlist.push("「사용일자」가 비어 있어요");
  else if (invalidDate) wlist.push("「사용일자」가 날짜 형식이 아니에요");
  if (!evidenceNo) wlist.push("「비고(증빙번호)」가 비어 있어요");

  return {
    rowIndex: i,
    usageDate: u,
    partnerRaw, // v2: 출장자 raw (콤마 구분)
    partners,
    orgName: o,
    outPlace,
    payMethod: getByRe(row, kcols, /지급/),
    detail,
    writerName,
    nameSource,
    drafter3: drafterSignatureGraphemes(writerName, 3),
    memberText: partnerRaw || writerName, // PDF 출장 인원 칸
    periodText: periodText.trim(),
    purposeText: purpose,
    evidenceNo,
    totalAmount,
    expenseLines,
    orgGroup: labels.group,
    approver1: labels.approver1,
    approver2: labels.approver2,
    hasEmpty: wlist.length > 0,
    fieldWarnings: wlist,
    approvalGroupOverride: "auto",
    // v2 전용 부수 정보 — 가게명은 PDF 에 표시 안 함, 검토용으로만 detail 안에 보존됨
    // (TripRow 타입은 변경하지 않고 partnerRaw 에 출장자를 담아 호환 유지)
    ...({} as { _merchant?: string }),
    _merchant: merchant,
  } as TripRow & { _merchant?: string };
}

export type ParseD4V2Result = {
  rows: TripRow[];
  errors: ParseError[];
  headerLineIndex: number;
  keys: string[];
};

export function parseD4V2Csv(fileText: string, datePh?: DatePlaceholders): ParseD4V2Result {
  const parsed = Papa.parse<string[]>(fileText, { skipEmptyLines: false });
  const matrix = (parsed.data as string[][]).filter((r) =>
    r.some((c) => norm(c).length > 0),
  );
  const errors = parsed.errors as ParseError[];

  let headerI = -1;
  for (let i = 0; i < Math.min(matrix.length, 25); i++) {
    if (norm(matrix[i][0] ?? "") === "사용일자" || (matrix[i][0] ?? "").includes("사용일자")) {
      headerI = i;
      break;
    }
  }
  if (headerI < 0) return { rows: [], errors, headerLineIndex: -1, keys: [] };

  const sub = matrix[headerI + 1] ?? [];
  const keys = buildMergedHeaderKeys(matrix[headerI] ?? [], sub);
  const kcols = toKeyCol(keys);
  const dataStart = headerI + 2;
  const out: TripRow[] = [];
  for (let i = dataStart; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    if (!isDataRow(row)) continue;
    if (row[0] === "사용일자" && /집행/.test(row.join(""))) continue;
    out.push(rowToTripV2(i, row, kcols, datePh));
  }
  return { rows: out, errors, headerLineIndex: headerI, keys };
}
