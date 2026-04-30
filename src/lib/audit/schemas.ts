/**
 * 기관별 표준 시트 + 핵심 컬럼 스키마.
 *
 * 표준 데이터 시트 외(원본/검수/매칭/대시보드/사본/작업현황)는 F3 경고.
 * 숨겨진 시트·컬럼은 F4 경고.
 */

import type { OrgCode } from "@/lib/audit/types";

/** 표준 데이터 시트 (제출용 xlsx에 있어야 하는 시트) — 기관별 */
export const ORG_STANDARD_SHEETS: Record<Exclude<OrgCode, "unknown">, string[]> = {
  iportfolio: [
    "총괄표",
    "A-1.내부인건비",
    "A-2.외부인건비",
    "B.사업수당",
    "C.장비∙시설임차비",
    "D-1-1.외부 전문가 기술 활용비-강사활용비",
    "D-1-2.외부 전문가 기술 활용비-외부 전문가 활용비",
    "D-2.회의비",
    "D-3.소프트웨어활용비",
    "D-4.출장비",
    "E-1.인쇄∙복사∙슬라이드 제작비",
    "E-3.우편요금∙택배비",
    "E-4.일용직활용비",
    "E-5.기타경비",
    "F-1.일반관리비",
    "G.부가가치세",
  ],
  dimi: [
    "총괄표",
    "D-1-1.외부 전문가 기술 활용비-코디네이터 활용비",
    "D-1-2.외부 전문가 기술 활용비-강사 활용비",
    "D-1-3.외부 전문가 기술 활용비-외부 전문가 활용비",
    "D-3.소프트웨어활용비",
    "D-4.출장비",
    "F.일반관리비",
    "G.부가가치세",
  ],
  konkuk: [
    "총괄표",
    "A-1.외부인건비",
    "A-2.사업수당",
    "D-1-1.외부 전문가 기술 활용비-코디네이터 활용비",
    "D-1-2.외부 전문가 기술 활용비-강사 활용비",
    "D-4.출장비",
    "E-2.제세공과∙수수료∙공공요금",
    "F.일반관리비",
    "G.부가가치세",
  ],
};

/** 비표준 시트 패턴 — 매칭되면 F3 경고. 제출용 xlsx에 있으면 안 됨. */
export const NON_SUBMISSION_SHEET_PATTERNS: RegExp[] = [
  /검수\s*데이터/,
  /원본/,
  /매칭/,
  /대시보드/,
  /작업\s*현황/,
  /사본/,
];

/** 핵심 컬럼 — alias 매칭으로 컬럼 인덱스 확정 */
export type CoreColumn =
  | "usageDate" | "execDate" | "partner"
  | "supply" | "vat" | "total" | "bank"
  | "detail" | "payment" | "evidenceNo" | "org";

export const COLUMN_ALIASES: Record<CoreColumn, string[]> = {
  usageDate: ["사용일자"],
  execDate: ["집행일자"],
  partner: ["거래처"],
  supply: ["공급가액"],
  vat: ["부가세", "세액"],
  total: ["합계금액"],
  bank: ["통장 금액", "통장지출금액", "통장 지출금액", "통장 출금액", "통장출금액"],
  detail: [
    "사용내역(수령인)",
    "사용내역",
    "사용내역(수령인)\n(폴더)",
    "사용내역(수령인)(하연)",
  ],
  payment: ["지급방법", "지급방법(카드/계좌이체)", "지급방법\n(카드/계좌이체)"],
  evidenceNo: [
    "비고(증빙번호)",
    "비고\n(증빙번호)",
    "비고(증빙)",
    "증빙번호",
  ],
  org: ["집행 기관명", "집행기관명"],
};

const norm = (s: string) => s.replace(/\s+/g, "").replace(/\n/g, "").toLowerCase();

export function findCoreColumn(
  cols: { idx: number; key: string }[],
  target: CoreColumn,
): number | null {
  const aliases = COLUMN_ALIASES[target].map(norm);
  // 1) 완전 일치 우선 — "통장 지출금액" 이 "통장사본" 보다 강하게 매칭되도록
  for (const c of cols) {
    const k = norm(c.key);
    if (aliases.some((a) => k === a)) return c.idx;
  }
  // 2) 컬럼 키가 alias 로 시작 — "통장 지출금액(원)" 같은 변형 흡수
  for (const c of cols) {
    const k = norm(c.key);
    if (aliases.some((a) => k.startsWith(a))) return c.idx;
  }
  // 3) 마지막으로 부분 일치 — 단, alias 길이가 3자 이상일 때만 (너무 짧은 alias 가 오인식 유발)
  for (const c of cols) {
    const k = norm(c.key);
    if (aliases.some((a) => a.length >= 3 && k.includes(a))) return c.idx;
  }
  return null;
}

/** 파일명에서 기관 추정. macOS HFS NFD 정규화 차이를 흡수하기 위해 NFC 로 정규화. */
export function guessOrgFromFilename(name: string): OrgCode {
  const n = name.normalize("NFC").replace(/\s+/g, "").toLowerCase();
  if (
    n.startsWith("아★") ||
    n.startsWith("아2025") ||
    /아이포트폴리오|iportfolio/.test(n)
  )
    return "iportfolio";
  if (
    n.startsWith("디★") ||
    n.startsWith("디2025") ||
    /디지털미디어|dimi|디미교연/.test(n)
  )
    return "dimi";
  if (
    n.startsWith("건★") ||
    n.startsWith("건2025") ||
    /건국대|konkuk/.test(n)
  )
    return "konkuk";
  return "unknown";
}

/** 비목 코드 추출 ("D-1-1.외부..." → "D-1-1") */
export function extractCategoryCode(sheetName: string): string {
  const m = sheetName.match(/^([A-Z]-\d+(?:-\d+)?|[A-Z])/);
  return m ? m[1] : "";
}

/** 표준 시트 / 비표준 시트 / 숨김 시트 분류 */
export function classifySheet(
  name: string,
  hidden: boolean,
  org: OrgCode,
): { isStandardData: boolean; reason?: string } {
  if (hidden) return { isStandardData: false, reason: "숨김 시트" };
  for (const pat of NON_SUBMISSION_SHEET_PATTERNS) {
    if (pat.test(name)) return { isStandardData: false, reason: "비제출용 시트(검수/원본/매칭/대시보드/사본/작업현황)" };
  }
  if (org === "unknown") return { isStandardData: true };
  const list = ORG_STANDARD_SHEETS[org];
  if (list.includes(name)) return { isStandardData: true };
  return { isStandardData: true, reason: `${org} 표준 시트 목록에 없음 — 기관 표준 확인 필요` };
}

/** 총괄표 → 비목 코드 → 행 매핑 (어드민에서 override 가능). 기본값 */
export const DEFAULT_TOTAL_SHEET_MAPPING: Record<OrgCode, Record<string, number>> = {
  iportfolio: {},
  dimi: {},
  konkuk: {},
  unknown: {},
};
