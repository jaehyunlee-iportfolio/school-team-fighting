// 작성일자·승인일 자동 계산.
//
// 집행일자를 기준으로 N 영업일 뺀 날짜를 계산.
// 기본값:
//   - 작성일자       = 집행일자 - 2 영업일 (writer)
//   - 담당자 승인일  = 집행일자 - 1 영업일 (handler)
//   - 결재권자 승인일 = 집행일자 - 1 영업일 (approver)
//
// 검토 단계에서 사용자가 D-N 값을 자유롭게 변경할 수 있음 (DateOffsets 인자).
// 시간 흐름 제약: 작성 ≥ 승인 ≥ 0 (커야 자연스러움). 0 입력 시 집행일자 당일에서
// 가장 가까운 과거 영업일이 됨 (subtractBusinessDays(_, 0) 동작).

import {
  formatDateKR,
  parseLooseDate,
  subtractBusinessDays,
} from "./holidays";

export type AutoDates = {
  /** 작성일자 (한국식 표시) */
  writerDate: string;
  /** 담당자 승인일 */
  handlerApprovalDate: string;
  /** 결재권자 승인일 */
  approverApprovalDate: string;
};

/** 집행일자에서 각 일자가 며칠 전 영업일인지. 0 = 집행일자 당일(또는 가장 가까운 과거 영업일). */
export type DateOffsets = {
  writer: number;
  handler: number;
  approver: number;
};

export const DEFAULT_DATE_OFFSETS: DateOffsets = {
  writer: 2,
  handler: 1,
  approver: 1,
};

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

/** Date 객체로부터 자동 일자 3개 계산. */
export function computeAutoDates(
  executionDate: Date,
  offsets: DateOffsets = DEFAULT_DATE_OFFSETS,
): AutoDates {
  const writer = subtractBusinessDays(executionDate, clamp(offsets.writer));
  const handler = subtractBusinessDays(executionDate, clamp(offsets.handler));
  const approver = subtractBusinessDays(executionDate, clamp(offsets.approver));
  return {
    writerDate: formatDateKR(writer),
    handlerApprovalDate: formatDateKR(handler),
    approverApprovalDate: formatDateKR(approver),
  };
}

/** 문자열 집행일자로부터 자동 일자 계산. 파싱 실패 시 빈 값들. */
export function computeAutoDatesFromString(
  executionDateStr: string,
  offsets: DateOffsets = DEFAULT_DATE_OFFSETS,
): AutoDates {
  const d = parseLooseDate(executionDateStr);
  if (!d) {
    return { writerDate: "", handlerApprovalDate: "", approverApprovalDate: "" };
  }
  return computeAutoDates(d, offsets);
}
