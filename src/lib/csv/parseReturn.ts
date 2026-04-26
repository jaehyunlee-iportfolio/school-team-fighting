import Papa from "papaparse";
import {
  type ReturnApprovalCell,
  type ReturnSettings,
} from "@/lib/firebase/firestore";

export type ReturnRow = {
  rowIndex: number;
  primaryKey: string;
  org: string;
  name: string;
  /** 원본 출장기간 (CSV/JSON 그대로) */
  periodRaw: string;
  /** PDF 표시용 정규화: "YYYY. M. D ~ YYYY. M. D" */
  periodText: string;
  /** 파일명용 시작일 6자리 YYMMDD (실패 시 빈 문자열) */
  startYymmdd: string;
  /** 출장기간 파싱 실패 여부 */
  invalidPeriod: boolean;
  destination: string;
  purpose: string;
  workContent: string;
  notes: string;
  cost: string;
  /** 출장경비 아래 작은 글씨 주석 (예: "*출장비 산정 내역서 별도 첨부"). 비면 미표시 */
  costAnnotation: string;
  payment: string;
  approval: [ReturnApprovalCell, ReturnApprovalCell, ReturnApprovalCell];
  hasEmpty: boolean;
  fieldWarnings: string[];
};

const COLUMN_KEYS = [
  "Primary Key",
  "출장자_소속",
  "출장자_성명",
  "출장기간",
  "출장지",
  "출장목적",
  "업무내용",
  "특이사항",
  "출장경비",
  "출장경비_주석",
  "정산방법",
] as const;

/* ─────────────────────────────────────────────────────────────────
 * 출장기간 정규화
 * ─────────────────────────────────────────────────────────────── */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 한 토큰을 [year, month, day]로 파싱. 실패 시 null. */
function parseSingleDate(s: string): [number, number, number] | null {
  const t = s.trim();
  // YYYY.MM.DD. 또는 YYYY.MM.DD
  let m = t.match(/(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})/);
  if (m) return [+m[1], +m[2], +m[3]];
  // YYYY-MM-DD
  m = t.match(/(\d{4})\s*-\s*(\d{1,2})\s*-\s*(\d{1,2})/);
  if (m) return [+m[1], +m[2], +m[3]];
  // YY|YYYY 년 M 월 D 일
  m = t.match(/(\d{2,4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (m) {
    const y = m[1].length === 2 ? 2000 + +m[1] : +m[1];
    return [y, +m[2], +m[3]];
  }
  return null;
}

export type PeriodResult = {
  periodText: string;
  startYymmdd: string;
  invalid: boolean;
};

/**
 * 다양한 포맷의 출장기간을 표준 형식으로:
 *   "YYYY. M. D ~ YYYY. M. D"
 * 단일 날짜만 있으면 시작=종료로 복제.
 * 파싱 실패 시 invalid=true.
 */
export function normalizePeriod(raw: string): PeriodResult {
  const cleaned = raw.trim();
  if (!cleaned) return { periodText: "", startYymmdd: "", invalid: true };

  // "(...일간)" 같은 부가 텍스트 제거
  const stripped = cleaned.replace(/\([^)]*\)/g, "").trim();

  // "~" 또는 "∼"으로 시작·종료 분리 시도
  const splitMatch = stripped.split(/\s*[~∼]\s*/);
  const left = splitMatch[0]?.trim() ?? "";
  const right = (splitMatch[1] ?? "").trim();

  const start = parseSingleDate(left);
  const end = right ? parseSingleDate(right) : null;

  if (!start) {
    return { periodText: "", startYymmdd: "", invalid: true };
  }

  const [sy, sm, sd] = start;
  const [ey, em, ed] = end ?? start;
  const periodText = `${sy}. ${sm}. ${sd} ~ ${ey}. ${em}. ${ed}`;
  const startYymmdd = `${pad2(sy % 100)}${pad2(sm)}${pad2(sd)}`;

  return { periodText, startYymmdd, invalid: false };
}

/* ─────────────────────────────────────────────────────────────────
 * 검증
 * ─────────────────────────────────────────────────────────────── */

export function recomputeReturnWarnings(
  r: Omit<ReturnRow, "hasEmpty" | "fieldWarnings">
): ReturnRow {
  const w: string[] = [];
  if (!r.primaryKey.trim()) w.push("「Primary Key」가 비어 있어요");
  if (!r.org.trim()) w.push("「출장자 소속」이 비어 있어요");
  if (!r.name.trim()) w.push("「출장자 성명」이 비어 있어요");
  if (!r.periodRaw.trim()) w.push("「출장기간」이 비어 있어요");
  else if (r.invalidPeriod) w.push("「출장기간」을 날짜로 인식하지 못했어요");
  if (!r.destination.trim()) w.push("「출장지」가 비어 있어요");
  if (!r.purpose.trim()) w.push("「출장목적」이 비어 있어요");
  if (!r.workContent.trim()) w.push("「업무내용」이 비어 있어요");
  if (!r.cost.trim()) w.push("「출장경비」가 비어 있어요");
  if (!r.payment.trim()) w.push("「정산방법」이 비어 있어요");

  // 결재 셀 검증
  r.approval.forEach((cell, i) => {
    const cellName = ["담당", "팀장", "본부장"][i];
    if (cell.type === "image" && !cell.imageUrl.trim()) {
      w.push(`결재(${cell.label || cellName}) 이미지 미업로드`);
    }
    if (cell.type === "text" && !cell.text.trim()) {
      w.push(`결재(${cell.label || cellName}) 텍스트 비어 있음`);
    }
  });

  return { ...r, hasEmpty: w.length > 0, fieldWarnings: w };
}

/* ─────────────────────────────────────────────────────────────────
 * 결재 셀 기본값 적용 — 출장자 이름으로 결재라인 자동 매핑
 *  - 장인선: [장인선 텍스트, 대각선, 장인선 서명(본부장)]
 *  - 김성윤: [김성윤 텍스트, 대각선, 김성윤 서명(대표이사)]
 *  - 그 외:  [출장자 텍스트, 채영지 서명(팀장), 장인선 서명(본부장)]
 * ─────────────────────────────────────────────────────────────── */

function applyDefaultApproval(
  settings: ReturnSettings,
  writerName: string
): [ReturnApprovalCell, ReturnApprovalCell, ReturnApprovalCell] {
  const sig = settings.signatures;
  const cellText = (label: string, text: string): ReturnApprovalCell => ({
    label,
    type: "text",
    text,
    imageUrl: "",
    annotation: "",
  });
  const cellDiagonal = (label: string): ReturnApprovalCell => ({
    label,
    type: "diagonal",
    text: "",
    imageUrl: "",
    annotation: "",
  });
  const cellImage = (label: string, url: string): ReturnApprovalCell => ({
    label,
    type: "image",
    text: "",
    imageUrl: url,
    annotation: "",
  });

  if (writerName === "장인선") {
    return [
      cellText("담당", writerName),
      cellDiagonal("팀장"),
      cellImage("본부장", sig.director),
    ];
  }
  if (writerName === "김성윤") {
    return [
      cellText("담당", writerName),
      cellDiagonal("팀장"),
      cellImage("대표이사", sig.ceo),
    ];
  }
  return [
    cellText("담당", writerName),
    cellImage("팀장", sig.manager),
    cellImage("본부장", sig.director),
  ];
}

/* ─────────────────────────────────────────────────────────────────
 * Row 빌드
 * ─────────────────────────────────────────────────────────────── */

function buildRow(
  rowIndex: number,
  raw: Record<string, unknown>,
  settings: ReturnSettings
): ReturnRow {
  const get = (key: string) => String(raw[key] ?? "").trim();
  const primaryKey = get("Primary Key");
  const org = get("출장자_소속");
  const name = get("출장자_성명");
  const periodRaw = get("출장기간");
  const destination = get("출장지");
  const purpose = get("출장목적");
  const workContent = get("업무내용");
  const notes = get("특이사항");
  const cost = get("출장경비");
  const costAnnotation = get("출장경비_주석");
  const payment = get("정산방법");

  const period = normalizePeriod(periodRaw);
  const approval = applyDefaultApproval(settings, name);

  return recomputeReturnWarnings({
    rowIndex,
    primaryKey,
    org,
    name,
    periodRaw,
    periodText: period.periodText,
    startYymmdd: period.startYymmdd,
    invalidPeriod: period.invalid,
    destination,
    purpose,
    workContent,
    notes,
    cost,
    costAnnotation,
    payment,
    approval,
  });
}

/* ─────────────────────────────────────────────────────────────────
 * Public API
 * ─────────────────────────────────────────────────────────────── */

export function parseReturnCsv(
  text: string,
  settings: ReturnSettings
): ReturnRow[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  const data = result.data ?? [];
  const rows: ReturnRow[] = [];
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    if (!r) continue;
    // Primary Key 또는 성명 둘 다 비면 스킵 (빈 줄 안전망)
    if (!r["Primary Key"]?.trim() && !r["출장자_성명"]?.trim()) continue;
    rows.push(buildRow(i, r, settings));
  }
  return rows;
}

export function parseReturnJson(
  text: string,
  settings: ReturnSettings
): ReturnRow[] {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error("JSON은 배열 형식이어야 해요.");
  }
  const rows: ReturnRow[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const r = parsed[i] as Record<string, unknown> | undefined;
    if (!r || typeof r !== "object") continue;
    const pk = String(r["Primary Key"] ?? "").trim();
    const nm = String(r["출장자_성명"] ?? "").trim();
    if (!pk && !nm) continue;
    rows.push(buildRow(i, r, settings));
  }
  return rows;
}

/** 파일 확장자로 자동 분기. */
export function parseReturnInput(
  filename: string,
  text: string,
  settings: ReturnSettings
): ReturnRow[] {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "json") return parseReturnJson(text, settings);
  return parseReturnCsv(text, settings);
}

export { COLUMN_KEYS };
