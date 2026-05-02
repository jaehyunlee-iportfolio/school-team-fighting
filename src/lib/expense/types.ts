// 지출결의서 데이터 타입.
//
// xlsx의 각 비목 탭에서 한 행 = 한 지출 건 = 한 PDF로 변환.
// 탭 이름이 세목/세세목을 결정 (Apps Script v3.9 TAB_TO_ACCOUNT_V3 포팅).

import type { ApprovalGroup } from "@/lib/approval/labels";

/** 지출결의서가 사용하는 그룹: 출장신청서와 동일하게 ipf/dimi */
export type ExpenseGroupCode = Extract<ApprovalGroup, "ipf" | "dimi">;

/** 탭 이름 → 세목/세세목 매핑 (Apps Script v3.9 TAB_TO_ACCOUNT_V3) */
export const TAB_TO_ACCOUNT: Record<string, { semok: string; sesemok: string }> = {
  "C.장비∙시설임차비": { semok: "사업시설장비비", sesemok: "장비∙시설임차비" },
  "D-1.외부 전문가 기술 활용비": { semok: "사업활동비", sesemok: "외부 전문가 기술 활용비" },
  "D-2.회의비": { semok: "사업활동비", sesemok: "회의비" },
  "D-3.소프트웨어활용비": { semok: "사업활동비", sesemok: "소프트웨어활용비" },
  "D-4.출장비": { semok: "사업활동비", sesemok: "출장비" },
  "E-1.인쇄∙복사∙슬라이드 제작비": { semok: "기타운영비", sesemok: "인쇄∙복사∙슬라이드 제작비" },
  "E-3.우편요금∙택배비": { semok: "기타운영비", sesemok: "우편요금∙택배비" },
  "E-4.일용직활용비": { semok: "기타운영비", sesemok: "일용직활용비" },
  "E-5.기타경비": { semok: "기타운영비", sesemok: "기타경비" },
  "F.일반관리비": { semok: "일반관리비(간접비)", sesemok: "" },
  "F-1.일반관리비": { semok: "일반관리비(간접비)", sesemok: "" },
};

/**
 * 탭 이름 → 세목/세세목.
 *
 * 디미교연/건국대 등은 D-1 을 코디네이터/강사/외부 전문가로 쪼갠 D-1-1, D-1-2,
 * D-1-3 시트로 제출함. F도 F.일반관리비 / F-1.일반관리비 등 표기가 갈림.
 * exact 매핑이 없을 때 패턴 fallback으로 같은 그룹에 매핑.
 */
export function getAccountForTab(
  sheetName: string,
): { semok: string; sesemok: string } | null {
  const exact = TAB_TO_ACCOUNT[sheetName];
  if (exact) return exact;
  if (/^D-1-\d+\.\s*외부\s*전문가\s*기술\s*활용비/.test(sheetName)) {
    return TAB_TO_ACCOUNT["D-1.외부 전문가 기술 활용비"] ?? null;
  }
  if (/^F(-\d+)?\.\s*일반관리비/.test(sheetName)) {
    return TAB_TO_ACCOUNT["F.일반관리비"] ?? null;
  }
  return null;
}

/** 데이터 행이 시작되기 전 무조건 스킵하는 탭들 */
export const SKIP_TABS = new Set<string>([
  "대시보드",
  "총괄표",
  "G.부가가치세",
  "D-1. 지급내역 매칭",
]);

/**
 * 헤더 컬럼 alias — Apps Script v3.9 DETAIL_COL 포팅.
 * xlsx 탭마다 헤더 표기가 살짝 달라서 여러 후보 중 매칭되는 것 사용.
 */
export const COLUMN_ALIASES = {
  executionDate: ["집행일자", "집행 일자", "거래일자"],
  vendor: ["거래처"],
  supply: ["공급가액", "공급가"],
  vat: ["부가세", "세액", "부가세액"],
  total: ["합계금액", "합계", "지출금액"],
  useDetail: ["사용내역(수령인)", "사용내역(수령인)\n(폴더)", "사용내역", "사용 내역"],
  /** PDF "2. 지출 목적"에 들어가는 열. useDetail과는 별도. */
  purpose: ["지출목적", "지출 목적", "지출내역", "지출 내역"],
  payment: ["지급방법", "지급 방법"],
  evidenceNo: ["비고(증빙번호)", "비고\n(증빙번호)", "증빙번호"],
  note: ["비고"],
} as const;

/** PDF 1장에 들어갈 한 지출 건의 모든 데이터 */
export type ExpenseRow = {
  rowIndex: number;
  /** 원본 탭 이름 (예: "D-1.외부 전문가 기술 활용비") */
  sourceTab: string;
  /** 매핑된 세목 */
  semok: string;
  /** 매핑된 세세목 */
  sesemok: string;
  /** PK = 비고(증빙번호) 값 (예: "D-1-100") */
  evidenceNo: string;
  vendor: string;
  /** 사용일자 — 원본 표기 그대로 */
  useDate: string;
  /** 집행일자 — 일련번호·영업일 계산 기준 */
  executionDate: string;
  /** 공급가액 (숫자) */
  supply: number;
  /** 세액 — null이면 PDF에 "-" 표시 */
  vat: number | null;
  /** 합계금액 (지출금액) */
  total: number;
  /** 사용내역(수령인) — 기본은 PDF에 표시 안 됨, 두 토글로 어디 출력할지 결정 */
  useDetail: string;
  /** 사용내역을 PDF "2. 지출 목적" 섹션에 함께 출력 */
  includeUseDetail: boolean;
  /** 사용내역을 PDF 지출결의 내용 표의 비고 셀에 함께 출력 */
  includeUseDetailInNote: boolean;
  /** 지출목적 — PDF "2. 지출 목적"에 들어감 */
  purpose: string;
  payment: string;
  note: string;

  // ── 자동 계산 (parseExpense에서 채움) ──
  /** 일련번호 (예: "IPF-20260331-R1234") */
  serial: string;
  /** 작성일자 — 집행일자 -1~3 영업일 랜덤 */
  writerDate: string;
  /** 담당자 승인일 — 집행일자 -1 영업일 (작성일자 ≤ 승인일 ≤ 집행일자) */
  handlerApprovalDate: string;
  /** 결재권자 승인일 — 집행일자 -1 영업일 */
  approverApprovalDate: string;

  // ── 검증 ──
  hasEmpty: boolean;
  fieldWarnings: string[];
};

/**
 * 사용내역(수령인) 텍스트를 「-」 줄(지출목적) 과 「*」 줄(비고) 로 분리.
 *
 * - 「1. 전문가명(...)」, 「2. 산출내역 및 활용내용」 같은 헤더 줄은 무시.
 * - 「-」 로 시작하는 줄들 → 지출목적 (개별 지출 항목)
 * - 「*」 로 시작하는 줄들 → 비고 (특이사항·메모)
 * - 그 외 줄 (빈 줄·헤더) → 무시
 *
 * 각 줄은 trim 한 결과를 사용해 들여쓰기 깔끔하게 정리.
 */
export function splitUseDetail(text: string): { purpose: string; note: string } {
  if (!text) return { purpose: "", note: "" };
  const purposeLines: string[] = [];
  const noteLines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("-")) purposeLines.push(trimmed);
    else if (trimmed.startsWith("*")) noteLines.push(trimmed);
  }
  return {
    purpose: purposeLines.join("\n"),
    note: noteLines.join("\n"),
  };
}

/**
 * 사용내역에 "소득세 발생" 표현이 있으면 비고에 자동으로 추가하는 마커 문구.
 * 인적용역(전문가활용비 등)에서 월별 합산 시 8.8% 원천징수가 발생하는 경우 PDF 비고에
 * 표시되어야 하는 표준 안내 문구.
 */
export const INCOME_TAX_MARKER = "*월별 지급 총액 합산 시 소득세 발생 건(8.8% 공제)";
const INCOME_TAX_KEYWORD = "소득세 발생";

/** 비고에 이 키워드가 있으면 사용내역에서 정형화된 비고를 새로 생성해서 교체. */
const HOLD_KEYWORD = "지출결의서 생성 보류";

/**
 * 사용내역에 "소득세 발생" 키워드가 있으면 비고에 마커 줄을 추가.
 * 이미 마커가 포함되어 있으면 중복 추가하지 않음 (idempotent).
 *
 * Why: 인적용역 8.8% 원천징수 안내 문구는 사용내역 본문에는 들어가 있지만 PDF의
 * 비고 셀에는 별도로 노출되어야 함. 사용자가 매번 손으로 옮겨 적던 작업을 자동화.
 */
function ensureIncomeTaxMarker(useDetail: string, note: string): string {
  if (!useDetail || !useDetail.includes(INCOME_TAX_KEYWORD)) return note;
  if (note.includes(INCOME_TAX_MARKER)) return note;
  return note.trim() ? `${note}\n${INCOME_TAX_MARKER}` : INCOME_TAX_MARKER;
}

/**
 * 사용내역에서 "1. 강사명(이름) / ..." 또는 "1. 전문가명(이름)" 등에서 이름만 추출.
 * 매칭 실패 시 빈 문자열.
 */
function extractRecipientName(useDetail: string): string {
  const m = useDetail.match(/1\.\s*[^()\n]*?명\s*\(([^)\n]+)\)/);
  return m ? m[1].trim() : "";
}

/**
 * 비고에 "지출결의서 생성 보류" 표시가 있으면 사용내역의 「-」 줄들을 정형화해서 비고를 새로 만든다.
 *
 * 변환 규칙: `- {MM/DD} / {금액}원 / {text}` (사용내역) → `- {MM/DD} {text} ({이름})` (비고)
 *
 * - 이름은 사용내역의 "1. ○○명(이름)" 패턴에서 추출
 * - 사용내역에 매칭되는 「-」 줄이 하나도 없으면 원래 비고를 그대로 둠 (안전 fallback)
 *
 * Why: 보류 행은 사용자가 데이터를 손으로 정리해야 하는 케이스. 정형 패턴이 정해져 있어서
 * 자동 변환 가능. 매번 수십~수백 건 손으로 옮겨 쓰던 작업을 제거.
 */
function transformHoldNote(useDetail: string, note: string): string {
  if (!note.includes(HOLD_KEYWORD)) return note;
  if (!useDetail) return note;
  const name = extractRecipientName(useDetail);
  const lines: string[] = [];
  for (const raw of useDetail.split(/\r?\n/)) {
    const t = raw.trim();
    if (!t.startsWith("-")) continue;
    // MM/DD 자체에 「/」가 들어있으므로 명시적으로 매칭한 뒤 나머지는 첫 번째 「/」로 split.
    const m = t.match(/^-\s*(\d{1,2}\/\d{1,2})\s*\/(.+?)\/(.+)$/);
    if (!m) continue;
    const mmdd = m[1];
    const text = m[3].trim();
    const namePart = name ? ` (${name})` : "";
    lines.push(`- ${mmdd} ${text}${namePart}`);
  }
  if (lines.length === 0) return note;
  return lines.join("\n");
}

/** 한 행의 필수값 검증 + 자동 후처리 (보류 행 변환 → 소득세 마커) */
export function recomputeWarnings(
  r: Omit<ExpenseRow, "hasEmpty" | "fieldWarnings">
): ExpenseRow {
  let note = transformHoldNote(r.useDetail, r.note);
  note = ensureIncomeTaxMarker(r.useDetail, note);
  const w: string[] = [];
  if (!r.evidenceNo.trim()) w.push("「증빙번호(PK)」가 비어 있어요");
  if (!r.executionDate.trim()) w.push("「집행일자」가 비어 있어요");
  if (!r.vendor.trim()) w.push("「거래처」가 비어 있어요");
  if (!Number.isFinite(r.total) || r.total <= 0) w.push("「지출금액(합계)」이 0이거나 비정상");
  if (!Number.isFinite(r.supply) || r.supply < 0) w.push("「공급가액」이 비정상");
  if (!r.purpose.trim()) w.push("「지출목적」이 비어 있어요");
  if (!r.payment.trim()) w.push("「지급방법」이 비어 있어요");
  return { ...r, note, hasEmpty: w.length > 0, fieldWarnings: w };
}
