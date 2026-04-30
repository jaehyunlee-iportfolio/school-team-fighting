/**
 * xlsx 읽기/쓰기 헬퍼.
 *
 * - 읽기: SheetJS 로 셀 v / w / t / 숨김 메타 추출
 * - 쓰기: 원본 workbook 의 cell 객체 v 만 갱신해 서식·수식·차트 보존
 */

import * as XLSX from "xlsx";
import type { AuditCell, AuditRow, AuditSheet, CellValue } from "@/lib/audit/types";

/** 헤더 행 검출 — "사용일자" 셀이 있는 행 (1-based) */
function findHeaderRow(ws: XLSX.WorkSheet): number {
  const ref = ws["!ref"];
  if (!ref) return 0;
  const range = XLSX.utils.decode_range(ref);
  const maxR = Math.min(range.e.r, range.s.r + 8);
  for (let r = range.s.r; r <= maxR; r++) {
    for (let c = range.s.c; c <= Math.min(range.e.c, range.s.c + 30); c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      const v = cell?.v;
      if (typeof v === "string" && v.includes("사용일자")) {
        return r + 1; // 1-based
      }
    }
  }
  return 0;
}

/** 헤더 행의 컬럼 목록 추출 (top + sub merge key) */
function buildColumns(
  ws: XLSX.WorkSheet,
  headerRow1Based: number,
): { idx: number; top: string; sub: string; key: string }[] {
  const ref = ws["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const cols: { idx: number; top: string; sub: string; key: string }[] = [];
  const r0 = headerRow1Based - 1;
  for (let c = range.s.c; c <= range.e.c; c++) {
    const topCell = ws[XLSX.utils.encode_cell({ r: r0, c })];
    const subCell = ws[XLSX.utils.encode_cell({ r: r0 + 1, c })];
    const top = topCell?.v != null ? String(topCell.v).trim() : "";
    const sub = subCell?.v != null ? String(subCell.v).trim() : "";
    let key = top || sub;
    if (top && sub && top !== sub) {
      if (top === "지출금액" && (sub === "공급가액" || sub === "부가세" || sub === "합계금액")) key = sub;
      else if (top === "지급방법" && sub.includes("카드")) key = "지급방법";
      else if (sub === "공급가액" || sub === "부가세" || sub === "합계금액") key = sub;
    }
    if (!key) key = `_col${c + 1}`;
    cols.push({ idx: c, top, sub, key });
  }
  return cols;
}

function cellRawToValue(cell: XLSX.CellObject | undefined): CellValue {
  if (!cell || cell.v === undefined) return null;
  if (cell.t === "d" && cell.v instanceof Date) return cell.v;
  if (typeof cell.v === "number" || typeof cell.v === "string" || typeof cell.v === "boolean") {
    return cell.v;
  }
  return cell.w ?? null;
}

/** 워크북에서 시트별로 데이터 행을 AuditRow 로 추출 */
export function extractSheetRows(
  ws: XLSX.WorkSheet,
  headerRow1Based: number,
  cols: { idx: number; key: string }[],
): AuditRow[] {
  const ref = ws["!ref"];
  if (!ref || !headerRow1Based) return [];
  const range = XLSX.utils.decode_range(ref);
  // 헤더 row + sub row 다음부터 데이터
  const dataStart0 = headerRow1Based + 1; // sub row 다음 (0-based로는 +0 → 헤더가 1-based이므로 데이터 시작 0-based = headerRow1Based+1)
  const rows: AuditRow[] = [];
  for (let r0 = dataStart0; r0 <= range.e.r; r0++) {
    const cells: Record<string, AuditCell> = {};
    let nonEmpty = false;
    for (const col of cols) {
      const addr = XLSX.utils.encode_cell({ r: r0, c: col.idx });
      const raw = cellRawToValue(ws[addr]);
      if (raw !== null && String(raw).trim() !== "") nonEmpty = true;
      cells[col.key] = {
        address: addr,
        rowIndex: r0 + 1,
        colIndex: col.idx,
        original: raw,
        current: raw,
        editSource: "none",
      };
    }
    if (!nonEmpty) continue;
    const firstCellVal = cells[cols[0]?.key]?.current;
    const firstStr = typeof firstCellVal === "string" ? firstCellVal : "";
    // 소계 행 스킵 (첫 셀에 "소계" / "합계" 단어)
    if (/^(소\s*계|합\s*계|총\s*계)/.test(firstStr)) continue;
    // 시트 하단 설명 섹션(<정의>, <주요내용>, <부당집행 기준> 등) 만나면 데이터 추출 종료.
    // 모든 컬럼을 훑어 어떤 셀이라도 <...> 마커로 시작하면 절단 — 시트마다 마커 위치가 달라서.
    let isSection = false;
    for (const col of cols) {
      const v = cells[col.key]?.current;
      if (typeof v === "string" && /^\s*<[^>]{1,30}>\s*$/.test(v)) {
        isSection = true;
        break;
      }
    }
    if (isSection) break;
    rows.push({ rowIndex: r0 + 1, cells });
  }
  return rows;
}

/** xlsx ArrayBuffer → 시트별 메타 + 데이터 */
export function readWorkbook(buffer: ArrayBuffer): {
  wb: XLSX.WorkBook;
  sheetMetas: {
    name: string;
    hidden: boolean;
    headerRow: number;
    columns: ReturnType<typeof buildColumns>;
    hiddenColumns: string[];
    rows: AuditRow[];
  }[];
} {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true, cellStyles: true });
  const sheetMetas: ReturnType<typeof readWorkbook>["sheetMetas"] = [];
  const wbWorkbook = wb.Workbook;
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const sheetMeta = wbWorkbook?.Sheets?.find((s) => s.name === sheetName);
    const hidden = sheetMeta?.Hidden === 1 || sheetMeta?.Hidden === 2;
    const headerRow = findHeaderRow(ws);
    const columns = headerRow ? buildColumns(ws, headerRow) : [];
    const hiddenColumns: string[] = [];
    const cols = ws["!cols"];
    if (cols) {
      for (let i = 0; i < cols.length; i++) {
        if (cols[i]?.hidden) hiddenColumns.push(XLSX.utils.encode_col(i));
      }
    }
    const rows = headerRow ? extractSheetRows(ws, headerRow, columns) : [];
    sheetMetas.push({ name: sheetName, hidden, headerRow, columns, hiddenColumns, rows });
  }
  return { wb, sheetMetas };
}

/** 편집된 셀들을 원본 workbook 에 적용해 ArrayBuffer 반환 (서식 보존) */
export function writeWorkbookWithEdits(
  wb: XLSX.WorkBook,
  sheets: AuditSheet[],
): ArrayBuffer {
  for (const sheet of sheets) {
    const ws = wb.Sheets[sheet.name];
    if (!ws) continue;
    for (const row of sheet.rows) {
      for (const cell of Object.values(row.cells)) {
        if (cell.editSource === "none") continue;
        const orig = ws[cell.address] ?? {};
        const v = cell.current;
        let t: XLSX.ExcelDataType = "s";
        if (v === null) t = "z";
        else if (v instanceof Date) t = "d";
        else if (typeof v === "number") t = "n";
        else if (typeof v === "boolean") t = "b";
        else t = "s";
        ws[cell.address] = {
          ...orig,
          v: v ?? "",
          t,
          w: undefined, // re-format
        };
      }
    }
  }
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx", cellStyles: true });
  return out as ArrayBuffer;
}
