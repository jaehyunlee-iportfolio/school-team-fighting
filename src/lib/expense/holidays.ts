// 한국 공휴일 + 영업일 계산.
//
// 정적 JSON으로 2025·2026·2027 공휴일 등록.
// 매년 갱신 필요. 새 해 추가는 이 파일 KOREAN_HOLIDAYS에 YYYY-MM-DD 추가.

/** 한국 공휴일 (대체공휴일 포함). 2025·2026·2027. */
const KOREAN_HOLIDAYS = new Set<string>([
  // 2025
  "2025-01-01", // 신정
  "2025-01-28", // 설날 연휴
  "2025-01-29", // 설날
  "2025-01-30", // 설날 연휴
  "2025-03-01", // 삼일절
  "2025-05-05", // 어린이날·부처님오신날
  "2025-05-06", // 대체공휴일 (어린이날)
  "2025-06-06", // 현충일
  "2025-08-15", // 광복절
  "2025-10-03", // 개천절
  "2025-10-05", // 추석 연휴
  "2025-10-06", // 추석
  "2025-10-07", // 추석 연휴
  "2025-10-08", // 대체공휴일
  "2025-10-09", // 한글날
  "2025-12-25", // 성탄절
  // 2026
  "2026-01-01",
  "2026-02-16", // 설날 연휴
  "2026-02-17", // 설날
  "2026-02-18", // 설날 연휴
  "2026-03-01",
  "2026-03-02", // 대체공휴일 (삼일절 일요일)
  "2026-05-05",
  "2026-05-24", // 부처님오신날
  "2026-05-25", // 대체공휴일
  "2026-06-06",
  "2026-08-15",
  "2026-08-17", // 대체공휴일 (광복절 토요일)
  "2026-09-24", // 추석 연휴
  "2026-09-25", // 추석
  "2026-09-26", // 추석 연휴
  "2026-10-03",
  "2026-10-05", // 대체공휴일 (개천절 토요일)
  "2026-10-09",
  "2026-12-25",
  // 2027
  "2027-01-01",
  "2027-02-06", // 설날 연휴
  "2027-02-07", // 설날
  "2027-02-08", // 설날 연휴
  "2027-02-09", // 대체공휴일
  "2027-03-01",
  "2027-05-05",
  "2027-05-13", // 부처님오신날
  "2027-06-06",
  "2027-06-07", // 대체공휴일 (현충일 일요일)
  "2027-08-15",
  "2027-08-16", // 대체공휴일
  "2027-09-14", // 추석 연휴
  "2027-09-15", // 추석
  "2027-09-16", // 추석 연휴
  "2027-10-03",
  "2027-10-04", // 대체공휴일
  "2027-10-09",
  "2027-12-25",
]);

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Date → "YYYY-MM-DD" */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 영업일 여부: 주말 + 공휴일 제외 */
export function isBusinessDay(d: Date): boolean {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  return !KOREAN_HOLIDAYS.has(isoDate(d));
}

/**
 * date에서 n 영업일 뺀 날짜 반환.
 * n=0이면 date 자체가 영업일이면 반환, 아니면 가장 가까운 과거 영업일.
 * n>0이면 영업일 n번 뒤로.
 */
export function subtractBusinessDays(date: Date, n: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  let remaining = n;
  // n=0인 경우: date가 영업일이면 그대로, 아니면 가장 가까운 과거 영업일까지 후퇴
  if (remaining === 0) {
    while (!isBusinessDay(d)) {
      d.setDate(d.getDate() - 1);
    }
    return d;
  }
  while (remaining > 0) {
    d.setDate(d.getDate() - 1);
    if (isBusinessDay(d)) remaining -= 1;
  }
  return d;
}

/** "YYYY-MM-DD" 또는 "YYYY. M. D" 등 다양한 입력을 Date로 파싱 */
export function parseLooseDate(s: string): Date | null {
  if (!s) return null;
  const cleaned = s.trim();
  // YYYY-MM-DD or YYYY/MM/DD
  let m = cleaned.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // "YYYY. M. D" or "YYYY. MM. DD"
  m = cleaned.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // ISO date with time
  const d = new Date(cleaned);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date → "YYYY. MM. DD" (양식 표시용) */
export function formatDateKR(d: Date): string {
  return `${d.getFullYear()}. ${pad(d.getMonth() + 1)}. ${pad(d.getDate())}`;
}
