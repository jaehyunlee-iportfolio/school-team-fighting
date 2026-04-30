/**
 * 검증 파이프라인 — Phase 1 카테고리: A1·A2·A3·A4·B1·C1·D1·D2·F1·F2·F3·F4·G1·G2·G3·H1·H2.
 * 파일 → AuditWorkbook 으로 변환하고 활성화된 검증 카테고리 실행.
 */

import * as XLSX from "xlsx";
import {
  ALL_CATEGORIES,
  type AuditCell,
  type AuditOptions,
  type AuditSheet,
  type AuditWorkbook,
  type CellValue,
  type Issue,
  type IssueCategory,
  type OrgCode,
  type SheetColumn,
} from "@/lib/audit/types";
import {
  classifySheet,
  extractCategoryCode,
  findCoreColumn,
  guessOrgFromFilename,
  ORG_STANDARD_SHEETS,
} from "@/lib/audit/schemas";
import { readWorkbook } from "@/lib/audit/excel";

function nextId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function isNonInteger(v: CellValue): boolean {
  return typeof v === "number" && Number.isFinite(v) && Math.floor(v) !== v;
}
/** "해당없음", "-", "N/A" 등 비숫자 placeholder 는 null. 숫자만 추출된 경우에만 number. */
function asNum(v: CellValue): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed) return null;
    if (/^(해당\s*없음|해당없음|N\/?A|-+|·+)$/i.test(trimmed)) return null;
    const cleaned = trimmed.replace(/[^\d.\-]/g, "");
    if (!cleaned || cleaned === "-" || cleaned === ".") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
const closeEnough = (a: number, b: number, tol = 1) => Math.abs(a - b) < tol;

function makeIssue(partial: Omit<Issue, "id">): Issue {
  return { id: nextId(), ...partial };
}

/** 메인: workbook → AuditWorkbook + issues */
export async function runAudit(
  file: File,
  options: AuditOptions,
): Promise<{ workbook: AuditWorkbook; xlsxRef: XLSX.WorkBook }> {
  const buf = await file.arrayBuffer();
  const { wb, sheetMetas } = readWorkbook(buf);
  const orgCode = guessOrgFromFilename(file.name);
  const fileIssues: Issue[] = [];

  // 시트 → AuditSheet 변환
  const sheets: AuditSheet[] = sheetMetas.map((m) => {
    const cls = classifySheet(m.name, m.hidden, orgCode);
    const issues: Issue[] = [];
    const columns: SheetColumn[] = m.columns;

    // F4: 숨김 시트
    if (m.hidden && options.enabledCategories.F4) {
      issues.push(
        makeIssue({
          severity: "warning",
          category: "F4",
          message: `숨겨진 시트 — 제출용 xlsx 에서 제거하거나 가시화 필요`,
          sheetName: m.name,
        }),
      );
    }
    // F3: 비표준 시트
    if (!cls.isStandardData && !m.hidden && options.enabledCategories.F3) {
      issues.push(
        makeIssue({
          severity: "warning",
          category: "F3",
          message: `비제출용 시트 의심 (${cls.reason ?? "불명"})`,
          sheetName: m.name,
        }),
      );
    }
    // F4: 숨김 컬럼
    if (m.hiddenColumns.length > 0 && options.enabledCategories.F4) {
      issues.push(
        makeIssue({
          severity: "warning",
          category: "F4",
          message: `숨겨진 컬럼: ${m.hiddenColumns.join(", ")} — 제출 전 검토 필요`,
          sheetName: m.name,
        }),
      );
    }
    // F2: 빈 헤더(_colN) — 표준 컬럼 없음
    const emptyHeaders = columns.filter((c) => c.key.startsWith("_col") && c.idx >= 0);
    if (emptyHeaders.length > 0 && options.enabledCategories.F2 && cls.isStandardData) {
      for (const c of emptyHeaders) {
        issues.push(
          makeIssue({
            severity: "warning",
            category: "F3",
            message: `헤더 없는 컬럼 ${XLSX.utils.encode_col(c.idx)} — 제출용 아닌 임시 컬럼 의심`,
            sheetName: m.name,
            cellAddress: XLSX.utils.encode_cell({ r: m.headerRow - 1, c: c.idx }),
          }),
        );
      }
    }

    return {
      name: m.name,
      category: extractCategoryCode(m.name),
      isStandardData: cls.isStandardData,
      hidden: m.hidden,
      headerRow: m.headerRow,
      columns,
      hiddenColumns: m.hiddenColumns,
      rows: m.rows,
      issues,
    };
  });

  // F2: 표준 시트 누락
  if (orgCode !== "unknown" && options.enabledCategories.F2) {
    const present = new Set(sheets.map((s) => s.name));
    for (const expected of ORG_STANDARD_SHEETS[orgCode]) {
      if (!present.has(expected)) {
        fileIssues.push(
          makeIssue({
            severity: "error",
            category: "F2",
            message: `필수 표준 시트 누락: "${expected}"`,
          }),
        );
      }
    }
  }

  // 데이터 시트별 검증
  for (const sheet of sheets) {
    if (!sheet.isStandardData) continue;
    runRowValidations(sheet, options, orgCode);
  }

  return {
    workbook: { fileName: file.name, orgCode, sheets, issues: fileIssues },
    xlsxRef: wb,
  };
}

/** 셀 상태 보존 재검증 — UI 의 "재검증" 버튼용 */
export function reauditWorkbook(wb: AuditWorkbook, options: AuditOptions): AuditWorkbook {
  const sheets = wb.sheets.map((s) => ({ ...s, issues: [] as Issue[] }));
  for (const sheet of sheets) {
    if (!sheet.isStandardData) continue;
    runRowValidations(sheet, options, wb.orgCode);
  }
  return { ...wb, sheets };
}

/** 활성화된 카테고리만 실행 */
function runRowValidations(sheet: AuditSheet, opts: AuditOptions, org: OrgCode) {
  const cols = sheet.columns;
  const supplyIdx = findCoreColumn(cols, "supply");
  const vatIdx = findCoreColumn(cols, "vat");
  const totalIdx = findCoreColumn(cols, "total");
  const bankIdx = findCoreColumn(cols, "bank");
  const usageDateIdx = findCoreColumn(cols, "usageDate");
  const execDateIdx = findCoreColumn(cols, "execDate");
  const partnerIdx = findCoreColumn(cols, "partner");
  const detailIdx = findCoreColumn(cols, "detail");
  const paymentIdx = findCoreColumn(cols, "payment");
  const evidenceIdx = findCoreColumn(cols, "evidenceNo");
  const orgIdx = findCoreColumn(cols, "org");

  const colKey = (idx: number | null) =>
    idx == null ? null : cols.find((c) => c.idx === idx)?.key ?? null;

  const supplyKey = colKey(supplyIdx);
  const vatKey = colKey(vatIdx);
  const totalKey = colKey(totalIdx);
  const bankKey = colKey(bankIdx);
  const usageDateKey = colKey(usageDateIdx);
  const execDateKey = colKey(execDateIdx);
  const partnerKey = colKey(partnerIdx);
  const detailKey = colKey(detailIdx);
  const paymentKey = colKey(paymentIdx);
  const evidenceKey = colKey(evidenceIdx);
  const orgKey = colKey(orgIdx);

  const evidenceSeen = new Map<string, number[]>(); // ev → [rowIndex...]
  const dupKey = new Map<string, number[]>();        // partner|date|total → [rowIndex...]

  const projectStart = new Date(opts.projectPeriod.start);
  const projectEnd = new Date(opts.projectPeriod.end);

  const officialOrgName =
    org === "iportfolio"
      ? opts.officialOrgNames.iportfolio
      : org === "dimi"
        ? opts.officialOrgNames.dimi
        : org === "konkuk"
          ? opts.officialOrgNames.konkuk
          : "";

  for (const row of sheet.rows) {
    const supply = supplyKey ? asNum(row.cells[supplyKey]?.current ?? null) : null;
    const vat = vatKey ? asNum(row.cells[vatKey]?.current ?? null) : null;
    const total = totalKey ? asNum(row.cells[totalKey]?.current ?? null) : null;
    const bank = bankKey ? asNum(row.cells[bankKey]?.current ?? null) : null;

    // A3: 소수점 정밀도
    if (opts.enabledCategories.A3) {
      for (const k of [supplyKey, vatKey, totalKey, bankKey]) {
        if (!k) continue;
        const cell = row.cells[k];
        if (cell && isNonInteger(cell.current)) {
          sheet.issues.push(
            makeIssue({
              severity: "error",
              category: "A3",
              message: `금액에 소수점이 포함됨 (raw=${cell.current}). 정수로 반올림 필요`,
              sheetName: sheet.name,
              cellAddress: cell.address,
              rowIndex: row.rowIndex,
              colIndex: cell.colIndex,
              autofix: "round-int",
              autofixPreview: Math.round(cell.current as number),
            }),
          );
        }
      }
    }

    // A1: 공급가액 + 부가세 = 합계금액
    if (opts.enabledCategories.A1 && supply != null && vat != null && total != null) {
      if (!closeEnough(supply + vat, total)) {
        sheet.issues.push(
          makeIssue({
            severity: "error",
            category: "A1",
            message: `공급가액(${supply}) + 부가세(${vat}) = ${supply + vat} ≠ 합계(${total})`,
            sheetName: sheet.name,
            cellAddress: row.cells[totalKey!]?.address,
            rowIndex: row.rowIndex,
          }),
        );
      }
    }

    // A2: 합계 = 통장
    if (opts.enabledCategories.A2 && total != null && bank != null && bankKey) {
      if (!closeEnough(total, bank)) {
        sheet.issues.push(
          makeIssue({
            severity: "error",
            category: "A2",
            message: `합계(${total}) ≠ 통장금액(${bank})`,
            sheetName: sheet.name,
            cellAddress: row.cells[bankKey]?.address,
            rowIndex: row.rowIndex,
          }),
        );
      }
    }

    // A4: 부가세 = 공급가액 × VAT% (1/11 backward 도 포함)
    if (opts.enabledCategories.A4 && supply != null && vat != null && total != null) {
      const expectVat = Math.round(supply * (opts.vatRate / 100));
      if (vat !== 0 && !closeEnough(vat, expectVat, 2)) {
        sheet.issues.push(
          makeIssue({
            severity: "warning",
            category: "A4",
            message: `부가세(${vat}) ≠ 공급가액×${opts.vatRate}% (예상 ${expectVat})`,
            sheetName: sheet.name,
            cellAddress: row.cells[vatKey!]?.address,
            rowIndex: row.rowIndex,
            autofix: "vat-backward",
            autofixPreview: total - Math.round((total * 10) / 11),
          }),
        );
      }
    }

    // B1: 필수 필드 빈 값 (사용일자/거래처/합계/사용내역/증빙번호/집행기관)
    if (opts.enabledCategories.B1) {
      const required: { key: string | null; label: string }[] = [
        { key: usageDateKey, label: "사용일자" },
        { key: partnerKey, label: "거래처" },
        { key: totalKey, label: "합계금액" },
        { key: detailKey, label: "사용내역(수령인)" },
        { key: evidenceKey, label: "비고(증빙번호)" },
        { key: orgKey, label: "집행 기관명" },
      ];
      for (const { key, label } of required) {
        if (!key) continue;
        const cell = row.cells[key];
        if (!cell) continue;
        const v = cell.current;
        const isEmpty = v == null || (typeof v === "string" && v.trim() === "");
        if (isEmpty) {
          sheet.issues.push(
            makeIssue({
              severity: "error",
              category: "B1",
              message: `필수값 비어있음: ${label}`,
              sheetName: sheet.name,
              cellAddress: cell.address,
              rowIndex: row.rowIndex,
              colIndex: cell.colIndex,
            }),
          );
        }
      }
    }

    // C1: X / FALSE 마커 — 증빙 Checklist 컬럼 (T~AA 범위 추정)
    if (opts.enabledCategories.C1) {
      for (const c of cols) {
        const cell = row.cells[c.key];
        if (!cell) continue;
        const v = cell.current;
        const sv = typeof v === "string" ? v.trim().toUpperCase() : v === false ? "FALSE" : "";
        if (sv === "X" || sv === "FALSE") {
          // 핵심 데이터 컬럼은 제외 (이미 다른 검증에서 처리)
          if ([supplyKey, vatKey, totalKey, bankKey, partnerKey, detailKey].includes(c.key)) continue;
          sheet.issues.push(
            makeIssue({
              severity: sv === "X" ? "error" : "warning",
              category: "C1",
              message: `증빙 미제출/체크 누락 (${sv})`,
              sheetName: sheet.name,
              cellAddress: cell.address,
              rowIndex: row.rowIndex,
              colIndex: cell.colIndex,
              autofix: "remove-x",
              autofixPreview: "",
            }),
          );
        }
      }
    }

    // D1: 증빙번호 형식 + D2 중복
    if (evidenceKey && (opts.enabledCategories.D1 || opts.enabledCategories.D2)) {
      const cell = row.cells[evidenceKey];
      const ev = typeof cell?.current === "string" ? cell.current.trim() : "";
      if (ev) {
        // 토큰 추출
        const m = ev.match(/[A-Z]-\d+(?:-\d+)*/);
        if (opts.enabledCategories.D1 && (!m || m[0] !== ev)) {
          sheet.issues.push(
            makeIssue({
              severity: "warning",
              category: "D1",
              message: `증빙번호 형식 의심: "${ev}"`,
              sheetName: sheet.name,
              cellAddress: cell.address,
              rowIndex: row.rowIndex,
            }),
          );
        }
        if (opts.enabledCategories.D2) {
          const arr = evidenceSeen.get(ev) ?? [];
          arr.push(row.rowIndex);
          evidenceSeen.set(ev, arr);
        }
      }
    }

    // E1·E2·E3 — 날짜
    if (usageDateKey && execDateKey) {
      const ucell = row.cells[usageDateKey];
      const ecell = row.cells[execDateKey];
      const uVal = ucell?.current;
      const eVal = ecell?.current;
      const uDate = uVal instanceof Date ? uVal : null;
      const eDate = eVal instanceof Date ? eVal : null;
      if (opts.enabledCategories.E1) {
        for (const [key, val, label] of [
          [usageDateKey, uVal, "사용일자"],
          [execDateKey, eVal, "집행일자"],
        ] as const) {
          if (val == null) continue;
          if (!(val instanceof Date)) {
            sheet.issues.push(
              makeIssue({
                severity: "warning",
                category: "E1",
                message: `${label} 가 Date 타입이 아님 — 텍스트로 입력됨 (${String(val)})`,
                sheetName: sheet.name,
                cellAddress: row.cells[key]?.address,
                rowIndex: row.rowIndex,
              }),
            );
          }
        }
      }
      if (opts.enabledCategories.E2 && uDate && eDate && uDate.getTime() > eDate.getTime()) {
        sheet.issues.push(
          makeIssue({
            severity: "warning",
            category: "E2",
            message: `사용일자(${uDate.toISOString().slice(0, 10)}) > 집행일자(${eDate.toISOString().slice(0, 10)})`,
            sheetName: sheet.name,
            cellAddress: ucell?.address,
            rowIndex: row.rowIndex,
            autofix: "swap-dates",
          }),
        );
      }
      if (opts.enabledCategories.E3 && uDate) {
        if (uDate < projectStart || uDate > projectEnd) {
          sheet.issues.push(
            makeIssue({
              severity: "warning",
              category: "E3",
              message: `사용일자가 사업기간 (${opts.projectPeriod.start} ~ ${opts.projectPeriod.end}) 밖`,
              sheetName: sheet.name,
              cellAddress: ucell?.address,
              rowIndex: row.rowIndex,
            }),
          );
        }
      }
    }

    // G1: 공식 기관명
    if (opts.enabledCategories.G1 && orgKey && officialOrgName) {
      const cell = row.cells[orgKey];
      const v = typeof cell?.current === "string" ? cell.current.trim() : "";
      if (v && v !== officialOrgName) {
        sheet.issues.push(
          makeIssue({
            severity: "warning",
            category: "G1",
            message: `집행 기관명이 공식 명칭과 불일치: "${v}" ≠ "${officialOrgName}"`,
            sheetName: sheet.name,
            cellAddress: cell.address,
            rowIndex: row.rowIndex,
            autofix: "normalize-org",
            autofixPreview: officialOrgName,
          }),
        );
      }
    }
    // G2: 지급방법 화이트리스트
    if (opts.enabledCategories.G2 && paymentKey) {
      const cell = row.cells[paymentKey];
      const v = typeof cell?.current === "string" ? cell.current.trim() : "";
      if (v && !opts.paymentMethods.includes(v)) {
        sheet.issues.push(
          makeIssue({
            severity: "warning",
            category: "G2",
            message: `지급방법 비표준 값: "${v}" (허용: ${opts.paymentMethods.join(", ")})`,
            sheetName: sheet.name,
            cellAddress: cell.address,
            rowIndex: row.rowIndex,
            autofix: "normalize-payment",
          }),
        );
      }
    }
    // G3: 거래처 trim
    if (opts.enabledCategories.G3 && partnerKey) {
      const cell = row.cells[partnerKey];
      const v = typeof cell?.current === "string" ? cell.current : "";
      if (v && v !== v.trim()) {
        sheet.issues.push(
          makeIssue({
            severity: "info",
            category: "G3",
            message: `거래처에 양끝 공백`,
            sheetName: sheet.name,
            cellAddress: cell.address,
            rowIndex: row.rowIndex,
            autofix: "trim",
            autofixPreview: v.trim(),
          }),
        );
      }
    }

    // H1: 거래처+일자+합계 중복
    if (opts.enabledCategories.H1 && partnerKey && usageDateKey && totalKey) {
      const partner = String(row.cells[partnerKey]?.current ?? "");
      const dateV = row.cells[usageDateKey]?.current;
      const dateStr = dateV instanceof Date ? dateV.toISOString().slice(0, 10) : String(dateV ?? "");
      const t = String(row.cells[totalKey]?.current ?? "");
      const k = `${partner}|${dateStr}|${t}`;
      const arr = dupKey.get(k) ?? [];
      arr.push(row.rowIndex);
      dupKey.set(k, arr);
    }
  }

  // D2 중복 issue 추가
  if (opts.enabledCategories.D2) {
    for (const [ev, rows] of evidenceSeen.entries()) {
      if (rows.length > 1) {
        for (const ri of rows) {
          sheet.issues.push(
            makeIssue({
              severity: "error",
              category: "D2",
              message: `증빙번호 "${ev}" 가 ${rows.length}회 중복`,
              sheetName: sheet.name,
              rowIndex: ri,
            }),
          );
        }
      }
    }
  }
  // H1
  if (opts.enabledCategories.H1) {
    for (const [k, rows] of dupKey.entries()) {
      if (rows.length > 1) {
        for (const ri of rows) {
          sheet.issues.push(
            makeIssue({
              severity: "warning",
              category: "H1",
              message: `중복 행 의심 (거래처|일자|합계 동일): ${k} — ${rows.length}건`,
              sheetName: sheet.name,
              rowIndex: ri,
            }),
          );
        }
      }
    }
  }
}

/** 자동수정 적용 — 셀 업데이트 후 재검증 필요 */
export function applyAutofix(cell: AuditCell, issue: Issue): AuditCell {
  const fix = issue.autofix;
  if (!fix) return cell;
  let next: CellValue = cell.current;
  switch (fix) {
    case "round-int":
      if (typeof cell.current === "number") next = Math.round(cell.current);
      break;
    case "trim":
      if (typeof cell.current === "string") next = cell.current.trim();
      break;
    case "remove-x":
      next = "";
      break;
    case "vat-backward":
      // issue.autofixPreview 가 미리 계산되어 있음
      if (typeof issue.autofixPreview === "number") next = issue.autofixPreview;
      break;
    case "swap-dates":
      // 호출 측에서 두 셀 동시 swap 처리해야 함 — 여기서는 패스
      break;
    case "normalize-org":
    case "normalize-payment":
      if (issue.autofixPreview != null) next = issue.autofixPreview;
      break;
  }
  return {
    ...cell,
    current: next,
    editSource: "autofix",
    lastAutofix: fix,
  };
}

/** 셀을 original 로 되돌림 */
export function revertCell(cell: AuditCell): AuditCell {
  return {
    ...cell,
    current: cell.original,
    editSource: "none",
    lastAutofix: undefined,
  };
}

/** 기본 옵션 */
export function defaultAuditOptions(): AuditOptions {
  const enabled: Record<IssueCategory, boolean> = {} as Record<IssueCategory, boolean>;
  for (const c of ALL_CATEGORIES) enabled[c] = true;
  return {
    enabledCategories: enabled,
    projectPeriod: { start: "2025-06-01", end: "2026-05-31" },
    vatRate: 10,
    paymentMethods: ["카드", "계좌이체"],
    officialOrgNames: {
      iportfolio: "(주)아이포트폴리오",
      dimi: "(사)디지털미디어교육콘텐츠 교사연구협회",
      konkuk: "건국대학교 산학협력단",
    },
  };
}
