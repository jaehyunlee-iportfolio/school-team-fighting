import type { ParseError } from "papaparse";
import Papa from "papaparse";

import { drafterSignatureGraphemes, resolveWriterName } from "@/lib/names/parseName";
import { getApprovalHeaderLabels, type ApprovalGroup } from "@/lib/approval/labels";

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

/** 상+하 2행 헤더. `지출금액` 아래 열(공급·부가·합)은 하행 셀명 사용 */
export function buildMergedHeaderKeys(
  topRow: string[],
  subRow: string[]
): string[] {
  const n = Math.max(topRow.length, subRow.length, 0);
  const keys: string[] = [];
  for (let j = 0; j < n; j++) {
    const t = norm(topRow[j] ?? "");
    const b = norm(subRow[j] ?? "");
    let k = t;
    if (t === "지출금액" && b) k = b;
    else if (b) {
      if (t) {
        if (t === "지급방법" && b.startsWith("(") && b.includes("카드")) {
          k = "지급방법(카드/계좌이체)";
        } else if (t && b && t !== b) {
          if (["공급가액", "부가세", "합계금액"].includes(b)) k = b;
          else if (b.length < 8 && /[가-힣]/.test(b) && t !== b) {
            if (/공급|부가|합계|영지|일치|담|다슬|검증|FALSE|TRUE|O|비고|증빙/.test(b) || t === "지출금액")
              k = b;
            else if (!t) k = b;
          }
        }
      } else {
        k = b;
      }
    } else {
      if (!k) k = t;
    }
    if (!k) k = `__empty${j}`;
    keys.push(k);
  }
  const out: string[] = [];
  const used = new Map<string, number>();
  for (let j = 0; j < keys.length; j++) {
    const base = keys[j] ?? `__c${j}`;
    const n0 = (used.get(base) ?? 0) + 1;
    used.set(base, n0);
    if (n0 > 1 && !base.startsWith("__empty")) {
      out.push(`${base}__${n0}`);
    } else {
      out.push(base);
    }
  }
  return out;
}

function toKeyCol(keys: string[]): KeyCol[] {
  return keys.map((key, index) => ({ key, index }));
}

function nfc(s: string | undefined | null): string {
  return s == null ? "" : s.normalize("NFC");
}

function getByRe(row: string[], kcols: KeyCol[], re: RegExp): string {
  for (const { key, index } of kcols) {
    if (re.test(key)) {
      return nfc(row[index]);
    }
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

const DATE_ISO = /^\d{4}-[0-1]?\d-[0-3]?\d$/;
const DATE_KR = /^\d{4}\.\s*\d{1,2}\.\s*\d{1,2}/;
const DATE_RANGE_KR = /^\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\s*~\s*\d{4}\.\s*\d{1,2}\.\s*\d{1,2}/;

/** "2025-07-05" 또는 "2025. 7. 5" → "2025. 7. 5" */
function toKoreanDateFormat(raw: string): string {
  const s = raw.trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}. ${Number(iso[2])}. ${Number(iso[3])}`;
  const kr = s.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (kr) return `${kr[1]}. ${Number(kr[2])}. ${Number(kr[3])}`;
  return s;
}

const LOOKS_LIKE_DATE = /\d{4}[\s.\-/]+\d{1,2}[\s.\-/]+\d{1,2}/;

export type DatePlaceholders = {
  dateFallback: string;
  dateInvalid: string;
};

const DEFAULT_DATE_PH: DatePlaceholders = {
  dateFallback: "YYYY. MM. DD",
  dateInvalid: "날짜 확인 불가",
};

function normalizeUsageDate(raw: string, ph: DatePlaceholders = DEFAULT_DATE_PH): {
  periodText: string;
  singleDate: boolean;
  invalidDate: boolean;
} {
  const trimmed = norm(raw);
  if (!trimmed) return { periodText: "", singleDate: false, invalidDate: false };

  if (trimmed.includes("~")) {
    const [left, right] = trimmed.split("~").map((s) => s.trim());
    const leftOk = LOOKS_LIKE_DATE.test(left);
    const rightOk = LOOKS_LIKE_DATE.test(right);
    if (leftOk && rightOk) {
      return {
        periodText: `${toKoreanDateFormat(left)} ~ ${toKoreanDateFormat(right)}`,
        singleDate: false,
        invalidDate: false,
      };
    }
    if (leftOk && !rightOk) {
      const formatted = toKoreanDateFormat(left);
      return {
        periodText: `${formatted} ~ ${ph.dateFallback}`,
        singleDate: true,
        invalidDate: false,
      };
    }
    return { periodText: ph.dateInvalid, singleDate: false, invalidDate: true };
  }

  if (!LOOKS_LIKE_DATE.test(trimmed)) {
    return { periodText: ph.dateInvalid, singleDate: false, invalidDate: true };
  }

  const formatted = toKoreanDateFormat(trimmed);
  return { periodText: `${formatted} ~ ${formatted}`, singleDate: true, invalidDate: false };
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

export type TripRow = {
  rowIndex: number;
  usageDate: string;
  partnerRaw: string;
  orgName: string;
  outPlace: string;
  payMethod: string;
  detail: string;
  writerName: string;
  nameSource: "georae" | "detail" | "none";
  drafter3: string;
  memberText: string;
  periodText: string;
  purposeText: string;
  orgGroup: "ipf" | "dimi" | "unknown";
  approver1: string;
  approver2: string;
  hasEmpty: boolean;
  fieldWarnings: string[];
  approvalGroupOverride: ApprovalGroup | "auto";
};

function rowToTrip(
  i: number,
  row: string[],
  kcols: KeyCol[],
  datePh?: DatePlaceholders
): TripRow {
  const p = getByRe(row, kcols, /^거래처$|거래처/);
  const d = getMainUsageDetail(row, kcols);
  const w = resolveWriterName(p, d);
  const o = getByRe(row, kcols, /집행.*기관/);
  const u = getByRe(row, kcols, /사용일자/);
  const labels = getApprovalHeaderLabels(o, "auto");

  const { periodText, singleDate, invalidDate } = normalizeUsageDate(u, datePh);

  const wlist: string[] = [];
  if (w.from === "none")
    wlist.push("이름: 거래처 또는 사용내역(출장자명)을 찾지 못함");
  if (!norm(d)) wlist.push("「사용내역(수령인)」이 비어 있어요");
  if (!norm(getByRe(row, kcols, /출장지/))) wlist.push("「출장지」가 비어 있어요");
  if (!norm(o)) wlist.push("「집행기관(명)」이 비어 있어요");
  if (!norm(u)) wlist.push("「사용일자」가 비어 있어요");
  else if (invalidDate)
    wlist.push("「사용일자」가 날짜 형식이 아니에요 — 직접 확인해 주세요");

  return {
    rowIndex: i,
    usageDate: u,
    partnerRaw: p,
    orgName: o,
    outPlace: getByRe(row, kcols, /출장지/),
    payMethod: getByRe(row, kcols, /지급/),
    detail: d,
    writerName: w.name,
    nameSource: w.from,
    drafter3: drafterSignatureGraphemes(w.name, 3),
    memberText: norm(p) || w.name,
    periodText: periodText.trim(),
    purposeText: d,
    orgGroup: labels.group,
    approver1: labels.approver1,
    approver2: labels.approver2,
    hasEmpty: wlist.length > 0,
    fieldWarnings: wlist,
    approvalGroupOverride: "auto",
  };
}

export function parseD4Csv(fileText: string, datePh?: DatePlaceholders): {
  rows: TripRow[];
  errors: ParseError[];
  headerLineIndex: number;
  keys: string[];
} {
  const parsed = Papa.parse<string[]>(fileText, { skipEmptyLines: false });
  const matrix = (parsed.data as string[][]).filter((r) =>
    r.some((c) => norm(c).length > 0)
  );
  const errors = parsed.errors as ParseError[];
  let headerI = -1;
  for (let i = 0; i < Math.min(matrix.length, 25); i++) {
    if (norm(matrix[i][0] ?? "") === "사용일자" || (matrix[i][0] ?? "").includes("사용일자")) {
      headerI = i;
      break;
    }
  }
  if (headerI < 0) {
    return { rows: [], errors, headerLineIndex: -1, keys: [] };
  }
  const sub = matrix[headerI + 1] ?? [];
  const keys = buildMergedHeaderKeys(matrix[headerI] ?? [], sub);
  const kcols = toKeyCol(keys);
  const dataStart = headerI + 2;
  const out: TripRow[] = [];
  for (let i = dataStart; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    if (!isDataRow(row)) continue;
    if (row[0] === "사용일자" && /집행/.test(row.join(""))) continue;
    out.push(rowToTrip(i, row, kcols, datePh));
  }
  return { rows: out, errors, headerLineIndex: headerI, keys };
}

export function recomputeRowWithOverride(
  base: TripRow,
  orgOverride: ApprovalGroup | "auto"
): TripRow {
  const labels = getApprovalHeaderLabels(base.orgName, orgOverride);
  return {
    ...base,
    orgGroup: labels.group,
    approver1: labels.approver1,
    approver2: labels.approver2,
    approvalGroupOverride: orgOverride,
  };
}
