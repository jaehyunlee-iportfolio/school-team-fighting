// 지출결의서용 xlsx 파일 → ExpenseRow[] 변환.
//
// 각 비목 탭은 1행 = 비목 제목, 행3·4 = 헤더 (공급가액·부가세 등이 행4에서 등장),
// 행5부터 데이터. SKIP_TABS와 TAB_TO_ACCOUNT에 없는 탭은 자동 스킵.

import * as XLSX from "xlsx";
import {
  COLUMN_ALIASES,
  SKIP_TABS,
  TAB_TO_ACCOUNT,
  recomputeWarnings,
  type ExpenseRow,
} from "@/lib/expense/types";
import { computeAutoDatesFromString } from "@/lib/expense/dates";
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
 * 행에서 alias에 매칭되는 컬럼 인덱스 찾기.
 * alias 우선순위 순서대로(외부 루프) 모든 헤더 행을 스캔(내부 루프)해서
 * 더 구체적인 alias가 먼저 매칭되도록 함.
 *
 * 예: 행 3 col D="지출금액"(병합된 부모 헤더), 행 4 col F="합계금액"(실제 컬럼).
 *  - aliases = ["합계금액", "합계", "지출금액"] 순서면
 *  - "합계금액"이 행 3에서 안 잡히고 행 4에서 col F 매칭 → F 반환 (정답)
 *  - 만약 헤더 행을 외부로 돌리면 행 3 col D가 "지출금액"으로 먼저 매칭돼 잘못된 결과
 */
function findColumnIndex(headerRows: Row[], aliases: readonly string[]): number {
  const normAliases = aliases.map(normalizeHeader);
  for (const alias of normAliases) {
    if (!alias) continue;
    for (const headerRow of headerRows) {
      for (let i = 0; i < headerRow.length; i++) {
        const cell = s(headerRow[i]);
        if (!cell) continue;
        const norm = normalizeHeader(cell);
        if (norm === alias || norm.includes(alias)) {
          return i;
        }
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
    const account = TAB_TO_ACCOUNT[sheetName];
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
      // 행 5+ 가 데이터 행
      estimatedRows = Math.max(0, sheetRows.length - 4);
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
 */
export async function parseExpenseXlsx(
  buffer: ArrayBuffer,
  orgCode: string,
  serialAlpha: string,
  selectedTabs?: Set<string>
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
    const account = TAB_TO_ACCOUNT[sheetName];
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

    // 헤더는 통상 행 3·4 (1-indexed) → 0-index 2·3
    const headerRows = [sheetRows[2] ?? [], sheetRows[3] ?? []];

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
    // 데이터는 행5부터 (0-index 4)
    for (let i = 4; i < sheetRows.length; i++) {
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
      const auto = computeAutoDatesFromString(executionDate);

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
  preserveSerial: boolean = false
): ExpenseRow {
  const auto = computeAutoDatesFromString(row.executionDate);
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
