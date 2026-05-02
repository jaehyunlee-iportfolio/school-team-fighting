// 작성일자·승인일 자동 계산.
//
// 집행일자를 기준으로 N 영업일 뺀 날짜를 계산.
// 기본값:
//   - 작성일자       = 집행일자 - 2 영업일 (writer)
//   - 담당자 승인일  = 집행일자 - 1 영업일 (handler)
//   - 결재권자 승인일 = 집행일자 - 1 영업일 (approver)
//
// 검토 단계에서 사용자가 D-N 값을 자유롭게 변경할 수 있음 (DateOffsets 인자).
// 0 입력 시 집행일자와 무조건 동일 (영업일 후퇴 없음 — 휴일이어도 그대로).
// N≥1 입력 시 영업일 기준으로 N 영업일 후퇴.

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

/**
 * 집행일자에서 N 영업일 후퇴한 날짜.
 * N=0 이면 집행일자 그대로 (휴일이어도 후퇴 없음 — 사용자가 명시적으로 같은 날을 원하는 경우).
 */
function offsetFromExecution(executionDate: Date, n: number): Date {
  const clamped = clamp(n);
  if (clamped === 0) {
    return new Date(
      executionDate.getFullYear(),
      executionDate.getMonth(),
      executionDate.getDate(),
    );
  }
  return subtractBusinessDays(executionDate, clamped);
}

/** Date 객체로부터 자동 일자 3개 계산. */
export function computeAutoDates(
  executionDate: Date,
  offsets: DateOffsets = DEFAULT_DATE_OFFSETS,
): AutoDates {
  const writer = offsetFromExecution(executionDate, offsets.writer);
  const handler = offsetFromExecution(executionDate, offsets.handler);
  const approver = offsetFromExecution(executionDate, offsets.approver);
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
