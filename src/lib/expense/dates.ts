// 작성일자·승인일 자동 계산.
//
// 집행일자 기준으로:
//   - 작성일자 = 집행일자 - 랜덤(1~3) 영업일
//   - 담당자 승인일 = 집행일자 - 1 영업일
//   - 결재권자 승인일 = 집행일자 - 1 영업일
//
// 제약: 작성일자 ≤ 승인일 ≤ 집행일자 (시간 흐름).
// 작성=1 영업일이면 승인과 같은 날, 작성=2~3이면 작성이 더 과거.

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

/** 1~3 사이 균등 분포 정수 */
function randomWriterOffset(): number {
  return 1 + Math.floor(Math.random() * 3);
}

/** Date 객체로부터 자동 일자 3개 계산. */
export function computeAutoDates(executionDate: Date): AutoDates {
  const writerOffset = randomWriterOffset();
  const writer = subtractBusinessDays(executionDate, writerOffset);
  const handler = subtractBusinessDays(executionDate, 1);
  const approver = subtractBusinessDays(executionDate, 1);
  return {
    writerDate: formatDateKR(writer),
    handlerApprovalDate: formatDateKR(handler),
    approverApprovalDate: formatDateKR(approver),
  };
}

/** 문자열 집행일자로부터 자동 일자 계산. 파싱 실패 시 빈 값들. */
export function computeAutoDatesFromString(executionDateStr: string): AutoDates {
  const d = parseLooseDate(executionDateStr);
  if (!d) {
    return { writerDate: "", handlerApprovalDate: "", approverApprovalDate: "" };
  }
  return computeAutoDates(d);
}
