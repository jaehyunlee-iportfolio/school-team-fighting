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
  "F-1.일반관리비": { semok: "-", sesemok: "-" },
};

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
  purpose: ["지출목적", "지출 목적"],
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
  /** 사용내역(수령인) — 기본은 PDF에 표시 안 됨, includeUseDetail이 true면 지출 목적 아래 추가 */
  useDetail: string;
  /** 사용내역을 PDF "2. 지출 목적" 섹션에 함께 출력할지 여부 */
  includeUseDetail: boolean;
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

/** 한 행의 필수값 검증 */
export function recomputeWarnings(
  r: Omit<ExpenseRow, "hasEmpty" | "fieldWarnings">
): ExpenseRow {
  const w: string[] = [];
  if (!r.evidenceNo.trim()) w.push("「증빙번호(PK)」가 비어 있어요");
  if (!r.executionDate.trim()) w.push("「집행일자」가 비어 있어요");
  if (!r.vendor.trim()) w.push("「거래처」가 비어 있어요");
  if (!Number.isFinite(r.total) || r.total <= 0) w.push("「지출금액(합계)」이 0이거나 비정상");
  if (!Number.isFinite(r.supply) || r.supply < 0) w.push("「공급가액」이 비정상");
  if (!r.purpose.trim()) w.push("「지출목적」이 비어 있어요");
  if (!r.payment.trim()) w.push("「지급방법」이 비어 있어요");
  return { ...r, hasEmpty: w.length > 0, fieldWarnings: w };
}
