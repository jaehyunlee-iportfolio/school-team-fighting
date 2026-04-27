// 일련번호 생성 — IPF-YYYYMMDD-R{4자리} 또는 DMI-YYYYMMDD-M{4자리}.

import { parseLooseDate } from "./holidays";

function pad(n: number, w: number): string {
  return n.toString().padStart(w, "0");
}

/** 0~9999 사이 균등 분포 정수 (모듈러 편향 X — Math.random은 [0,1) uniform) */
function random4Digit(): string {
  return pad(Math.floor(Math.random() * 10000), 4);
}

/**
 * 일련번호 생성.
 * @example generateSerial("IPF", "R", new Date(2026, 2, 31)) → "IPF-20260331-R1234"
 */
export function generateSerial(
  orgCode: string,
  serialAlpha: string,
  executionDate: Date
): string {
  const ymd = `${executionDate.getFullYear()}${pad(executionDate.getMonth() + 1, 2)}${pad(executionDate.getDate(), 2)}`;
  return `${orgCode}-${ymd}-${serialAlpha}${random4Digit()}`;
}

/** 문자열 집행일자에서 일련번호 생성. 파싱 실패 시 빈 문자열 반환. */
export function generateSerialFromString(
  orgCode: string,
  serialAlpha: string,
  executionDateStr: string
): string {
  const d = parseLooseDate(executionDateStr);
  if (!d) return "";
  return generateSerial(orgCode, serialAlpha, d);
}
