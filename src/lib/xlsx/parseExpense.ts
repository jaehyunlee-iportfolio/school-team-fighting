// 지출결의서용 xlsx 파일 → ExpenseRow[] 변환.
//
// 헤더 위치는 시트마다 다름 (D-4 는 3행, D-1-1 은 2행) → "사용일자" 셀을
// 동적으로 찾아 메인 헤더로 사용. 그 다음 행이 서브 헤더(공급가액/세액/합계금액),
// 그 다음부터 데이터. SKIP_TABS와 getAccountForTab() 매핑이 없는 탭은 자동 스킵.

import * as XLSX from "xlsx";
import {
  COLUMN_ALIASES,
  SKIP_TABS,
  getAccountForTab,
  recomputeWarnings,
  type ExpenseRow,
} from "@/lib/expense/types";
import { computeAutoDatesFromString, type DateOffsets } from "@/lib/expense/dates";
import { generateSerialFromString } from "@/lib/expense/serial";
import { formatDateKR, parseLooseDate } from "@/lib/expense/holidays";

type Cell = string | number | Date | null | undefined;
type Row = Cell[];

/** 셀 값을 문자열로 안전 변환 */
function s(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return formatDateKR(v);
  return String(v).trim();
}

/** 셀 값을 숫자로 안전 변환. 빈 값/대시면 0 (또는 fallback) */
function n(v: Cell, fallback: number = 0): number {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  const t = String(v).trim();
  if (!t || t === "-") return fallback;
  // "1,234" 같은 콤마 제거
  const cleaned = t.replace(/[,\s]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : fallback;
}

/** 헤더 텍스트 정규화 — 공백/줄바꿈 제거해서 alias 매칭 */
function normalizeHeader(s: string): string {
  return s.replace(/\s+/g, "").trim();
}

/**
 * 헤더 행 위치를 동적으로 찾음 — "사용일자" 가 들어있는 첫 행을 메인 헤더로 간주.
 *
 * 시트마다 헤더 행 위치가 다름:
 *  - D-4 출장비: 1행=타이틀, 2행=부모헤더, 3행=메인헤더, 4행=서브헤더, 5행+=데이터
 *  - D-1-1 강사활용비: 1행=부모헤더, 2행=메인헤더, 3행=서브헤더, 4행+=데이터
 *
 * 정확히 「사용일자」 인 셀을 1순위로, 못 찾으면 substring 매칭으로 fallback.
 */
function findHeaderRowIdx(sheetRows: Row[]): number {
  const maxScan = Math.min(sheetRows.length, 12);
  // Pass 1: 완전 일치 ("사용일자")
  for (let r = 0; r < maxScan; r++) {
    const row = sheetRows[r];
    if (!row) continue;
    for (const cell of row) {
      if (normalizeHeader(s(cell)) === "사용일자") return r;
    }
  }
  // Pass 2: 부분 일치 ("사용일자(원본)" 같은 변형 흡수)
  for (let r = 0; r < maxScan; r++) {
    const row = sheetRows[r];
    if (!row) continue;
    for (const cell of row) {
      if (normalizeHeader(s(cell)).includes("사용일자")) return r;
    }
  }
  return -1;
}

/**
 * 행에서 alias에 매칭되는 컬럼 인덱스 찾기.
 *
 * 매칭 우선순위 (3-pass):
 *  1) 완전 일치 — 가장 정확. note alias「비고」가 「비고\n(증빙번호)」를 substring
 *     매칭으로 가로채는 사고 방지.
 *  2) startsWith — 「합계금액(원)」 같은 변형 흡수.
 *  3) substring — alias 가 3자 이상일 때만. 너무 짧은 alias 가 엉뚱한 컬럼을
 *     잡는 것 방지.
 *
 * alias 배열 순서가 우선순위 — 같은 pass 안에서는 앞에 있는 alias 가 우선.
 */
function findColumnIndex(headerRows: Row[], aliases: readonly string[]): number {
  const normAliases = aliases.map(normalizeHeader).filter((a) => a);
  // Pass 1: 완전 일치
  for (const alias of normAliases) {
    for (const headerRow of headerRows) {
      for (let i = 0; i < headerRow.length; i++) {
        const cell = s(headerRow[i]);
        if (!cell) continue;
        if (normalizeHeader(cell) === alias) return i;
      }
    }
  }
  // Pass 2: startsWith
  for (const alias of normAliases) {
    for (const headerRow of headerRows) {
      for (let i = 0; i < headerRow.length; i++) {
        const cell = s(headerRow[i]);
        if (!cell) continue;
        if (normalizeHeader(cell).startsWith(alias)) return i;
      }
    }
  }
  // Pass 3: substring (alias 길이 ≥3 일 때만)
  for (const alias of normAliases) {
    if (alias.length < 3) continue;
    for (const headerRow of headerRows) {
      for (let i = 0; i < headerRow.length; i++) {
        const cell = s(headerRow[i]);
        if (!cell) continue;
        if (normalizeHeader(cell).includes(alias)) return i;
      }
    }
  }
  return -1;
}

/**
 * Date 객체를 가까운 자정으로 반올림한 뒤 "YYYY. MM. DD" 출력.
 *
 * 배경: Numbers/일부 도구로 만든 xlsx의 날짜 셀이 부동소수점 오차로
 * 정확히 자정이 아니라 23:59:08 같이 미세하게 어긋나 있는 경우가 있음.
 * Excel은 셀 포맷으로 반올림해 다음 날짜를 표시하지만 JS Date는 그대로
 * 가져와서 getDate()가 -1된 날을 반환해 PDF에 잘못 출력되는 문제 발생.
 * 자정에 가까운 시각이면(절반 이상) 다음 날로 정렬해 Excel 표시와 일치시킴.
 */
function formatDateKRRounded(v: Date): string {
  const dayMs = 86400000;
  const midnight = new Date(v.getFullYear(), v.getMonth(), v.getDate()).getTime();
  const offset = v.getTime() - midnight;
  const adjusted = offset > dayMs / 2 ? new Date(midnight + dayMs) : new Date(midnight);
  return formatDateKR(adjusted);
}

/** Excel 직렬 날짜 (1900 epoch) → "YYYY. MM. DD" (자정 근처 반올림 포함) */
function excelSerialToDateString(v: Cell): string {
  if (typeof v === "number" && v > 25569) {
    // 25569 = 1970-01-01 in Excel
    const d = new Date((v - 25569) * 86400 * 1000);
    if (!Number.isNaN(d.getTime())) return formatDateKRRounded(d);
  }
  if (v instanceof Date) return formatDateKRRounded(v);
  const str = s(v);
  const parsed = parseLooseDate(str);
  return parsed ? formatDateKR(parsed) : str;
}

export type ParseExpenseResult = {
  rows: ExpenseRow[];
  /** 처리한 탭 목록 */
  processedTabs: string[];
  /** 스킵한 탭 목록 (사유 포함) */
  skippedTabs: { name: string; reason: string }[];
};

/** xlsx 탭 정보 (자료 단계 미리보기용) */
export type XlsxTabInfo = {
  name: string;
  /** 처리 가능 (TAB_TO_ACCOUNT에 매핑 + 스킵 대상 아님) */
  processable: boolean;
  /** 매핑된 세목/세세목 (processable일 때만) */
  semok?: string;
  sesemok?: string;
  /** 처리 못 하는 이유 */
  reason?: string;
  /** 데이터 행 수 (대략) — processable일 때만 */
  estimatedRows?: number;
};

/** xlsx에서 탭 목록과 처리 가능 여부만 빠르게 추출 */
export async function listExpenseTabs(buffer: ArrayBuffer): Promise<XlsxTabInfo[]> {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const out: XlsxTabInfo[] = [];
  for (const sheetName of wb.SheetNames) {
    if (SKIP_TABS.has(sheetName)) {
      out.push({ name: sheetName, processable: false, reason: "고정 스킵" });
      continue;
    }
    const account = getAccountForTab(sheetName);
    if (!account) {
      out.push({ name: sheetName, processable: false, reason: "세목 매핑 없음" });
      continue;
    }
    const ws = wb.Sheets[sheetName];
    let estimatedRows = 0;
    if (ws) {
      const sheetRows = XLSX.utils.sheet_to_json<Row>(ws, {
        header: 1, defval: null, blankrows: false,
      });
      // 헤더 위치 동적 검출 (D-1-1 은 2행, D-4 는 3행)
      const headerIdx = findHeaderRowIdx(sheetRows);
      const dataStart = headerIdx >= 0 ? headerIdx + 2 : 4;
      estimatedRows = Math.max(0, sheetRows.length - dataStart);
    }
    out.push({
      name: sheetName,
      processable: true,
      semok: account.semok,
      sesemok: account.sesemok,
      estimatedRows,
    });
  }
  return out;
}

/**
 * xlsx ArrayBuffer → ExpenseRow[]
 * @param orgCode 일련번호 prefix (예: "IPF")
 * @param serialAlpha 일련번호 알파벳 (예: "R")
 * @param selectedTabs (선택) 특정 탭들만 처리. undefined면 처리 가능한 모든 탭.
 * @param offsets (선택) 작성·승인일 영업일 offset. 미지정 시 DEFAULT_DATE_OFFSETS.
 */
export async function parseExpenseXlsx(
  buffer: ArrayBuffer,
  orgCode: string,
  serialAlpha: string,
  selectedTabs?: Set<string>,
  offsets?: DateOffsets,
): Promise<ParseExpenseResult> {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const rows: ExpenseRow[] = [];
  const processedTabs: string[] = [];
  const skippedTabs: { name: string; reason: string }[] = [];

  let globalIndex = 0;

  for (const sheetName of wb.SheetNames) {
    if (SKIP_TABS.has(sheetName)) {
      skippedTabs.push({ name: sheetName, reason: "고정 스킵" });
      continue;
    }
    const account = getAccountForTab(sheetName);
    if (!account) {
      skippedTabs.push({ name: sheetName, reason: "세목 매핑 없음" });
      continue;
    }
    if (selectedTabs && !selectedTabs.has(sheetName)) {
      skippedTabs.push({ name: sheetName, reason: "사용자가 선택 해제" });
      continue;
    }

    const ws = wb.Sheets[sheetName];
    if (!ws) {
      skippedTabs.push({ name: sheetName, reason: "시트 비어있음" });
      continue;
    }

    // 시트를 2D 배열로 변환 (헤더 없음, 빈 셀 null)
    const sheetRows = XLSX.utils.sheet_to_json<Row>(ws, {
      header: 1,
      defval: null,
      blankrows: false,
    });
    if (sheetRows.length < 5) {
      skippedTabs.push({ name: sheetName, reason: "데이터 행 없음" });
      continue;
    }

    // 헤더 위치 동적 검출 — "사용일자" 가 있는 행을 메인 헤더로.
    // 부모 헤더(병합된 상위 라벨, 예: 「사용내역(수령인)」 이 col 11 에 머지) 도 스캔에 포함.
    // → 메인 헤더에는 빈칸이지만 부모에만 라벨이 있는 컬럼도 인식 가능.
    const headerRowIdx = findHeaderRowIdx(sheetRows);
    if (headerRowIdx < 0) {
      skippedTabs.push({ name: sheetName, reason: "헤더 행(사용일자) 못 찾음" });
      continue;
    }
    const headerRows: Row[] = [];
    if (headerRowIdx >= 1) headerRows.push(sheetRows[headerRowIdx - 1] ?? []);
    headerRows.push(sheetRows[headerRowIdx] ?? []);
    headerRows.push(sheetRows[headerRowIdx + 1] ?? []);
    const dataStartIdx = headerRowIdx + 2;

    const cols = {
      executionDate: findColumnIndex(headerRows, COLUMN_ALIASES.executionDate),
      vendor: findColumnIndex(headerRows, COLUMN_ALIASES.vendor),
      supply: findColumnIndex(headerRows, COLUMN_ALIASES.supply),
      vat: findColumnIndex(headerRows, COLUMN_ALIASES.vat),
      total: findColumnIndex(headerRows, COLUMN_ALIASES.total),
      useDetail: findColumnIndex(headerRows, COLUMN_ALIASES.useDetail),
      purpose: findColumnIndex(headerRows, COLUMN_ALIASES.purpose),
      payment: findColumnIndex(headerRows, COLUMN_ALIASES.payment),
      evidenceNo: findColumnIndex(headerRows, COLUMN_ALIASES.evidenceNo),
      note: findColumnIndex(headerRows, COLUMN_ALIASES.note),
    };
    // useDate는 보통 첫 컬럼 ("사용일자")
    const useDateIdx = findColumnIndex(headerRows, ["사용일자"]);

    let added = 0;
    // 데이터는 헤더 + 서브 다음부터
    for (let i = dataStartIdx; i < sheetRows.length; i++) {
      const r = sheetRows[i] ?? [];
      // 완전 빈 행 스킵
      const evidenceNo = cols.evidenceNo >= 0 ? s(r[cols.evidenceNo]) : "";
      const total = cols.total >= 0 ? n(r[cols.total]) : 0;
      const supply = cols.supply >= 0 ? n(r[cols.supply]) : 0;
      // 증빙번호 없고 금액도 0이면 스킵
      if (!evidenceNo && total === 0 && supply === 0) continue;

      const executionDate =
        cols.executionDate >= 0 ? excelSerialToDateString(r[cols.executionDate]) : "";
      const useDate =
        useDateIdx >= 0 ? excelSerialToDateString(r[useDateIdx]) : "";

      // 부가세: "-" 문자열이면 null
      let vat: number | null = null;
      if (cols.vat >= 0) {
        const raw = r[cols.vat];
        const rawStr = s(raw);
        if (rawStr && rawStr !== "-") {
          vat = n(raw, 0);
        }
      }

      const serial = generateSerialFromString(orgCode, serialAlpha, executionDate);
      const auto = computeAutoDatesFromString(executionDate, offsets);

      const built: Omit<ExpenseRow, "hasEmpty" | "fieldWarnings"> = {
        rowIndex: globalIndex++,
        sourceTab: sheetName,
        semok: account.semok,
        sesemok: account.sesemok,
        evidenceNo,
        vendor: cols.vendor >= 0 ? s(r[cols.vendor]) : "",
        useDate,
        executionDate,
        supply,
        vat,
        total,
        useDetail: cols.useDetail >= 0 ? s(r[cols.useDetail]) : "",
        includeUseDetail: false,
        includeUseDetailInNote: false,
        purpose: cols.purpose >= 0 ? s(r[cols.purpose]) : "",
        payment: cols.payment >= 0 ? s(r[cols.payment]) : "",
        note: cols.note >= 0 ? s(r[cols.note]) : "",
        serial,
        writerDate: auto.writerDate,
        handlerApprovalDate: auto.handlerApprovalDate,
        approverApprovalDate: auto.approverApprovalDate,
      };

      rows.push(recomputeWarnings(built));
      added++;
    }

    processedTabs.push(sheetName);
    if (added === 0) {
      skippedTabs.push({ name: sheetName, reason: "유효한 데이터 행 없음" });
    }
  }

  return { rows, processedTabs, skippedTabs };
}

/** File → ArrayBuffer 헬퍼 */
export function readFileBuffer(f: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(f);
  });
}

/** 단일 ExpenseRow의 자동 계산 필드 재계산 (편집 다이얼로그 저장 시 사용) */
export function recomputeRowAutoFields(
  row: ExpenseRow,
  orgCode: string,
  serialAlpha: string,
  preserveSerial: boolean = false,
  offsets?: DateOffsets,
): ExpenseRow {
  const auto = computeAutoDatesFromString(row.executionDate, offsets);
  const serial = preserveSerial && row.serial
    ? row.serial
    : generateSerialFromString(orgCode, serialAlpha, row.executionDate);
  return recomputeWarnings({
    ...row,
    serial,
    writerDate: auto.writerDate,
    handlerApprovalDate: auto.handlerApprovalDate,
    approverApprovalDate: auto.approverApprovalDate,
  });
}
