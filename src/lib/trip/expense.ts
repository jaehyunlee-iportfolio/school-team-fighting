/**
 * 출장신청서 — 산출내역 자동 분류 + 그룹화 + 소요경비 표 빌드.
 *
 * 입력: parseD4Csv가 만든 TripRow[] (행 단독 정보)
 * 출력: TripGroup[] (같은 출장으로 묶인 행들 + 그룹의 소요경비 표)
 */

import type { ExpenseCategory, ExpenseLine, TripRow } from "@/lib/csv/parseD4";
import { getApprovalHeaderLabels, type ApprovalGroup } from "@/lib/approval/labels";

/* ─────────────────────────────────────────────────────────────────
 * 카테고리 키워드 매핑 (Q3에서 확정)
 * ─────────────────────────────────────────────────────────────── */

const CATEGORY_KEYWORDS: Array<{ category: ExpenseCategory; keywords: string[]; labelKeywords?: string[] }> = [
  {
    category: "교통비",
    keywords: ["KTX", "SRT", "ITX", "항공", "항공권", "비행기", "버스", "택시", "지하철", "자차", "대중교통", "톨게이트", "통행료", "주유", "주차", "유류", "기차", "고속버스"],
    // 교통수단 라벨 추출용 (정확히 매칭되는 토큰을 라벨로)
    labelKeywords: ["KTX", "SRT", "ITX", "항공", "항공권", "비행기", "버스", "택시", "지하철", "자차", "기차", "고속버스"],
  },
  { category: "식비", keywords: ["식대", "식비", "식사", "다과", "간식", "음료", "커피", "점심", "저녁", "조식", "중식", "석식"] },
  { category: "일비", keywords: ["일비", "일당"] },
  { category: "숙박비", keywords: ["숙박", "호텔", "모텔", "펜션", "리조트", "게스트하우스"] },
];

/* ─────────────────────────────────────────────────────────────────
 * 산출내역 라인 추출 + 분류
 * ─────────────────────────────────────────────────────────────── */

/**
 * 사용내역(수령인) 텍스트에서 "2. 출장비 산출내역:" 다음 라인들을 추출.
 *
 * 지원 형식:
 *   2. 출장비 산출내역: KTX: 천안아산 → 서울 14,100원
 *   2. 출장비 산출내역: 식대 33,900원
 *   2. 출장비 산출내역:
 *    - 라인 A
 *    - 라인 B
 */
function extractCalcLines(detail: string): string[] {
  if (!detail) return [];
  const lines = detail.split(/\r?\n/).map((l) => l.trim());
  const startIdx = lines.findIndex((l) => /^2\.\s*출장비\s*산출내역/.test(l));
  if (startIdx < 0) return [];

  const startLine = lines[startIdx];
  // "2. 출장비 산출내역: <inline>" 케이스: 콜론 뒤 텍스트가 있으면 첫 라인으로 사용
  const inlineMatch = startLine.match(/산출내역\s*[:：]?\s*(.*)$/);
  const result: string[] = [];
  if (inlineMatch && inlineMatch[1].trim()) {
    result.push(inlineMatch[1].trim());
  }
  // 다음 라인부터 "3."이 나올 때까지 수집 (불릿 "-" 제거)
  for (let i = startIdx + 1; i < lines.length; i++) {
    const t = lines[i];
    if (!t) continue;
    if (/^3\./.test(t)) break;
    if (/^[1-9]\./.test(t)) break; // 다른 숫자 항목 진입
    // 선두 불릿 "-" 제거
    const cleaned = t.replace(/^-+\s*/, "").trim();
    if (cleaned) result.push(cleaned);
  }
  return result;
}

/** 라인에서 "14,100원" 같은 금액 토큰을 추출 (마지막 매칭) */
function extractAmount(text: string): number {
  // 콤마 포함 숫자 + (원)? 패턴, 또는 단순 숫자
  const matches = Array.from(text.matchAll(/(\d{1,3}(?:,\d{3})+|\d{2,})\s*원?/g));
  if (matches.length === 0) return 0;
  const last = matches[matches.length - 1];
  return Number(last[1].replace(/,/g, "")) || 0;
}

/** 라인 텍스트로 카테고리 판정 + 교통수단 라벨 추출 */
export function classifyExpenseLine(text: string): { category: ExpenseCategory; label: string; needsReview: boolean } {
  const upper = text.toUpperCase();
  for (const cat of CATEGORY_KEYWORDS) {
    const hit = cat.keywords.some((kw) => upper.includes(kw.toUpperCase()) || text.includes(kw));
    if (hit) {
      let label = "";
      if (cat.labelKeywords) {
        for (const lk of cat.labelKeywords) {
          if (upper.includes(lk.toUpperCase()) || text.includes(lk)) {
            label = lk;
            break;
          }
        }
      }
      return { category: cat.category, label, needsReview: false };
    }
  }
  return { category: "기타", label: "", needsReview: true };
}

/** 사용내역 detail 텍스트에서 ExpenseLine 배열을 만든다. fallbackTotal은 합계금액 */
export function parseExpenseLines(detail: string, fallbackTotal: number): ExpenseLine[] {
  const rawLines = extractCalcLines(detail);
  const items: ExpenseLine[] = rawLines.map((raw) => {
    const cls = classifyExpenseLine(raw);
    const amount = extractAmount(raw);
    return {
      category: cls.category,
      label: cls.label,
      amount: amount || 0,
      rawText: raw,
      needsReview: cls.needsReview,
    };
  });
  // 추출된 라인이 없거나 금액 합이 0이면, 전체를 "기타"로 fallback
  const sum = items.reduce((a, x) => a + x.amount, 0);
  if (items.length === 0 && fallbackTotal > 0) {
    return [{
      category: "기타",
      label: "",
      amount: fallbackTotal,
      rawText: "",
      needsReview: true,
    }];
  }
  // 라인 합이 fallbackTotal과 어긋나면 needsReview 표식 (기타는 이미 review 표식)
  if (sum > 0 && fallbackTotal > 0 && Math.abs(sum - fallbackTotal) > 100) {
    // 합 차이 100원 이상이면 첫 라인에 review 신호
    if (items.length > 0) items[0] = { ...items[0], needsReview: true };
  }
  return items;
}

/* ─────────────────────────────────────────────────────────────────
 * 그룹화
 * ─────────────────────────────────────────────────────────────── */

export type TripGroup = {
  /** 그룹 키 (periodText | outPlace) */
  key: string;
  representativePK: string;
  memberPKs: string[];
  /** 그룹 내 모든 행 (편집 시 보존) */
  rows: TripRow[];
  /** 그룹 출장자 명단 (행들의 partners 통합) */
  partners: string[];
  /** 행 간 partners 불일치 여부 */
  partnersMismatch: boolean;
  periodText: string;
  outPlace: string;
  purposeText: string;
  /** 대표자 (그룹 내 첫 행의 writerName 사용) */
  writerName: string;
  /** 기안자 서명용 그래핌 (writerName 첫 3글자) */
  drafter3: string;
  /** PDF "출장 인원" 셀 텍스트 (자동 채움 — partners 기반) */
  memberText: string;
  orgName: string;
  approver1: string;
  approver2: string;
  /** 결재 그룹 오버라이드 (auto/ipf/dimi) */
  approvalGroupOverride: ApprovalGroup | "auto";
  /** 출장 일수 (>=1) */
  days: number;
  /** 박수 (=days-1, 최소 0) */
  nights: number;
  /** 그룹 합계금액 (rows.totalAmount 합산) */
  totalAmount: number;
  /** 카테고리별 라인 통합 결과 */
  expenseTable: ExpenseTable;
  /** 그룹 내 자동 분류에 검토 필요한 라인이 있는지 */
  hasNeedsReview: boolean;
  /** 시작일 YYMMDD (파일명용) */
  startYymmdd: string;
  /** 검증 결과 */
  hasEmpty: boolean;
  fieldWarnings: string[];
};

export type ExpenseRow = {
  /** "내용" 셀 텍스트 (자동 생성) */
  contentText: string;
  /** 카테고리 합계 (그룹 단위) */
  total: number;
  /** 검토 필요 (자동 분류 실패 라인 포함) */
  needsReview: boolean;
};

export type ExpenseTable = {
  교통비: ExpenseRow;
  일비: ExpenseRow;
  식비: ExpenseRow;
  숙박비: ExpenseRow;
  기타: ExpenseRow;
  합계: number;
};

const EMPTY_ROW: ExpenseRow = { contentText: "", total: 0, needsReview: false };

/** 출장기간 "YYYY. M. D ~ YYYY. M. D"에서 일수/박수 계산 */
export function computeDaysNights(periodText: string): { days: number; nights: number } {
  if (!periodText) return { days: 1, nights: 0 };
  const parts = periodText.split("~").map((s) => s.trim());
  if (parts.length < 2) return { days: 1, nights: 0 };
  const m1 = parts[0].match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  const m2 = parts[1].match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (!m1 || !m2) return { days: 1, nights: 0 };
  const d1 = new Date(+m1[1], +m1[2] - 1, +m1[3]);
  const d2 = new Date(+m2[1], +m2[2] - 1, +m2[3]);
  const diff = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
  const days = Math.max(1, diff + 1);
  const nights = Math.max(0, diff);
  return { days, nights };
}

/** 그룹화: (periodText, outPlace) 같은 행끼리 묶음 */
export function buildTripGroups(rows: TripRow[]): TripGroup[] {
  const map = new Map<string, TripRow[]>();
  for (const r of rows) {
    const key = `${r.periodText}||${r.outPlace}`;
    const arr = map.get(key) ?? [];
    arr.push(r);
    map.set(key, arr);
  }
  // 입력 순서 유지: 첫 등장 인덱스 기준 정렬
  const firstIdx = new Map<string, number>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const key = `${r.periodText}||${r.outPlace}`;
    if (!firstIdx.has(key)) firstIdx.set(key, i);
  }
  const orderedKeys = Array.from(map.keys()).sort(
    (a, b) => (firstIdx.get(a) ?? 0) - (firstIdx.get(b) ?? 0)
  );
  return orderedKeys.map((key) => buildOneGroup(key, map.get(key)!));
}

function buildOneGroup(key: string, members: TripRow[]): TripGroup {
  const first = members[0];
  // 그룹 partners: 모든 멤버의 partners 합집합 (등장 순서 유지)
  const seen = new Set<string>();
  const partners: string[] = [];
  for (const r of members) {
    for (const p of r.partners) {
      if (!seen.has(p)) {
        seen.add(p);
        partners.push(p);
      }
    }
  }
  // partners 불일치: 멤버끼리 partners가 다르면 true
  const partnerSets = members.map((r) => r.partners.slice().sort().join("|"));
  const partnersMismatch = new Set(partnerSets).size > 1;

  const memberPKs = members.map((r) => r.evidenceNo).filter(Boolean);
  const totalAmount = members.reduce((a, r) => a + (r.totalAmount || 0), 0);
  const { days, nights } = computeDaysNights(first.periodText);
  const expenseTable = buildExpenseTable(members, partners.length, days, nights);
  const hasNeedsReview =
    expenseTable.교통비.needsReview ||
    expenseTable.일비.needsReview ||
    expenseTable.식비.needsReview ||
    expenseTable.숙박비.needsReview ||
    expenseTable.기타.needsReview;

  const memberText = formatGroupMemberText(partners);
  const startYymmdd = computeStartYymmdd(first.periodText);
  const draft: TripGroup = {
    key,
    representativePK: memberPKs[0] ?? first.evidenceNo,
    memberPKs,
    rows: members,
    partners,
    partnersMismatch,
    periodText: first.periodText,
    outPlace: first.outPlace,
    purposeText: first.purposeText,
    writerName: first.writerName,
    drafter3: first.drafter3,
    memberText,
    orgName: first.orgName,
    approver1: first.approver1,
    approver2: first.approver2,
    approvalGroupOverride: "auto",
    days,
    nights,
    totalAmount,
    expenseTable,
    hasNeedsReview,
    startYymmdd,
    hasEmpty: false,
    fieldWarnings: [],
  };
  return validateGroup(draft);
}

function formatGroupMemberText(partners: string[]): string {
  if (partners.length === 0) return "";
  if (partners.length === 1) return partners[0];
  // 2명 이상: 모두 콤마로 연결 (PDF 출장인원 셀)
  return partners.join(", ");
}

function computeStartYymmdd(periodText: string): string {
  const m = periodText.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (!m) return "";
  const yy = (Number(m[1]) % 100).toString().padStart(2, "0");
  const mm = Number(m[2]).toString().padStart(2, "0");
  const dd = Number(m[3]).toString().padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

/**
 * 그룹 검증 — hasEmpty/fieldWarnings 계산 후 새 객체 반환.
 *
 * hasEmpty는 "필수 필드 누락"만 반영. partnersMismatch나 hasNeedsReview는
 * 별도 배지(거래처 불일치 / 검토 필요)로 따로 표시되므로 hasEmpty에 포함하지 않음.
 * fieldWarnings에는 모두 포함하여 누락 표시 시 함께 노출.
 */
export function validateGroup(g: TripGroup): TripGroup {
  const w: string[] = [];
  let missing = 0;
  if (!g.writerName.trim()) { w.push("「작성자 성명」이 비어 있어요"); missing++; }
  if (!g.orgName.trim()) { w.push("「작성자 소속(집행기관)」이 비어 있어요"); missing++; }
  if (!g.partners.length) { w.push("「출장 인원(거래처)」이 비어 있어요"); missing++; }
  if (!g.periodText.trim()) { w.push("「출장 기간」이 비어 있어요"); missing++; }
  if (!g.outPlace.trim()) { w.push("「출장지」가 비어 있어요"); missing++; }
  if (!g.purposeText.trim()) { w.push("「출장 목적」이 비어 있어요"); missing++; }
  if (g.partnersMismatch) w.push("그룹 내 행 간 거래처(출장자)가 다릅니다 — 검토 필요");
  if (g.hasNeedsReview) w.push("자동 분류 실패 항목 있음 — 소요경비 표 검토 필요");
  return { ...g, hasEmpty: missing > 0, fieldWarnings: w };
}

/** 그룹의 expenseTable을 rows로부터 다시 계산 (사용자가 "재계산" 누르거나 partners/days 변경 시) */
export function recomputeGroupExpense(g: TripGroup): TripGroup {
  const { days, nights } = computeDaysNights(g.periodText);
  const expenseTable = buildExpenseTable(g.rows, g.partners.length, days, nights);
  const hasNeedsReview =
    expenseTable.교통비.needsReview ||
    expenseTable.일비.needsReview ||
    expenseTable.식비.needsReview ||
    expenseTable.숙박비.needsReview ||
    expenseTable.기타.needsReview;
  return validateGroup({ ...g, days, nights, expenseTable, hasNeedsReview });
}

/** 결재 그룹 오버라이드를 적용해 approver1/2를 다시 계산 */
export function recomputeGroupWithApprovalOverride(
  g: TripGroup,
  override: ApprovalGroup | "auto"
): TripGroup {
  const labels = getApprovalHeaderLabels(g.orgName, override);
  return {
    ...g,
    approver1: labels.approver1,
    approver2: labels.approver2,
    approvalGroupOverride: override,
  };
}

/* ─────────────────────────────────────────────────────────────────
 * 소요경비 표 빌드
 * ─────────────────────────────────────────────────────────────── */

/** 그룹 내 모든 expenseLines를 카테고리별로 합산하고 표 셀 텍스트를 생성 */
export function buildExpenseTable(
  members: TripRow[],
  personCount: number,
  days: number,
  nights: number
): ExpenseTable {
  const buckets: Record<ExpenseCategory, ExpenseLine[]> = {
    교통비: [], 일비: [], 식비: [], 숙박비: [], 기타: [],
  };
  for (const r of members) {
    for (const line of r.expenseLines) {
      buckets[line.category].push(line);
    }
  }

  const N = Math.max(1, personCount);

  const 교통비 = composeRow("교통비", buckets.교통비, N, days, nights);
  const 일비 = composeRow("일비", buckets.일비, N, days, nights);
  const 식비 = composeRow("식비", buckets.식비, N, days, nights);
  const 숙박비 = composeRow("숙박비", buckets.숙박비, N, days, nights);
  const 기타 = composeRow("기타", buckets.기타, N, days, nights);
  const 합계 = 교통비.total + 일비.total + 식비.total + 숙박비.total + 기타.total;

  return { 교통비, 일비, 식비, 숙박비, 기타, 합계 };
}

function composeRow(
  category: ExpenseCategory,
  lines: ExpenseLine[],
  N: number,
  days: number,
  nights: number
): ExpenseRow {
  if (lines.length === 0) return { ...EMPTY_ROW };
  const total = lines.reduce((a, l) => a + l.amount, 0);
  const needsReview = lines.some((l) => l.needsReview) || category === "기타";

  if (category === "기타") {
    // 원문 라벨 노출 + 검토 필요 표식
    const summary = lines
      .map((l) => l.rawText)
      .filter(Boolean)
      .slice(0, 3)
      .join(" / ");
    const more = lines.length > 3 ? ` 외 ${lines.length - 3}건` : "";
    const text = summary ? `⚠ ${summary}${more} — 검토 필요` : `⚠ 검토 필요`;
    return { contentText: text, total, needsReview: true };
  }

  // 라벨 (교통비만): 모든 라인의 label이 동일하면 그것 사용, 섞여 있으면 빈 문자열
  let label = "";
  if (category === "교통비") {
    const labels = new Set(lines.map((l) => l.label).filter(Boolean));
    if (labels.size === 1) label = lines[0].label;
  }

  const divisor = (() => {
    if (category === "일비") return N * days;
    if (category === "숙박비") return N * nights;
    return N;
  })();

  // 박수 0인데 숙박비 들어왔으면 비정상 → 검토 필요
  if (category === "숙박비" && nights === 0) {
    return {
      contentText: `⚠ 숙박비 라인 발견 (박수 0) — 검토 필요`,
      total,
      needsReview: true,
    };
  }
  if (divisor === 0) {
    return { contentText: `${formatNum(total)}원`, total, needsReview };
  }

  const evenly = total % divisor === 0;
  const contentText = evenly
    ? buildEvenlyText(category, label, total / divisor, N, days, nights)
    : buildUnevenlyText(category, total, N, days, nights);
  return { contentText, total, needsReview };
}

function formatNum(n: number): string {
  return n.toLocaleString("ko-KR");
}

function buildEvenlyText(
  category: ExpenseCategory,
  label: string,
  unit: number,
  N: number,
  days: number,
  nights: number
): string {
  const u = formatNum(unit);
  const labelPart = label ? `${label} ` : "";
  if (category === "일비") return `${labelPart}${u} x ${N}인 x ${days}일`;
  if (category === "숙박비") return `${labelPart}${u} x ${N}인 x ${nights}박`;
  return `${labelPart}${u} x ${N}인`;
}

function buildUnevenlyText(
  category: ExpenseCategory,
  total: number,
  N: number,
  days: number,
  nights: number
): string {
  const t = formatNum(total);
  if (category === "일비") return `${t} / ${N}인 / ${days}일`;
  if (category === "숙박비") return `${t} / ${N}인 / ${nights}박`;
  return `${t} / ${N}인`;
}
