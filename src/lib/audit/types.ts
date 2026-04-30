/**
 * 세부비목별집행내역서 검증기 도메인 타입.
 *
 * - AuditWorkbook: 1개 파일 = 1개 기관
 * - AuditSheet: 시트 1개 (데이터 탭 + 검수데이터/원본 등)
 * - AuditCell: 셀 1개 — original / current / editSource 트래킹으로 원복 가능
 * - Issue: 검증 결과 1건. 셀 또는 시트 또는 파일 레벨로 붙음
 */

export type OrgCode = "iportfolio" | "dimi" | "konkuk" | "unknown";

export type IssueSeverity = "error" | "warning" | "info";

/** 검증 카테고리 코드. 어드민 ON/OFF 토글, 필터, 자동수정 매핑에 사용. */
export type IssueCategory =
  | "A1" // 공급가액 + 부가세 = 합계금액
  | "A2" // 합계금액 = 통장금액
  | "A3" // 소수점 정밀도 (정수 아님)
  | "A4" // 부가세 = 공급가액 × 10/100 (1/11 backward)
  | "A5" // 소계 = Σ(데이터 행)
  | "B1" // 필수 필드 빈 값
  | "B2" // 증빙 Checklist 필수 4항목 빈 값
  | "C1" // 증빙 Checklist 'X' / 'FALSE' 마커
  | "C2" // 지출결의서 PDF 링크 누락
  | "D1" // 증빙번호 형식 위반
  | "D2" // 증빙번호 중복
  | "D3" // 증빙번호 비순차 (정보)
  | "E1" // 유효한 날짜 / 타입 혼재
  | "E2" // 사용일자 ≤ 집행일자
  | "E3" // 사업기간 안
  | "F1" // 표준 컬럼명 일치
  | "F2" // 누락된 표준 컬럼
  | "F3" // 추가된 엉뚱한 컬럼 (제출용 아닌 시트/컬럼)
  | "F4" // 숨겨진 컬럼/시트 감지 (경고)
  | "G1" // 집행기관명 공식 명칭
  | "G2" // 지급방법 화이트리스트
  | "G3" // 거래처명 공백/제어문자
  | "G4" // 사용내역 형식 (탭별 패턴)
  | "H1" // 거래처+일자+금액 중복 (경고)
  | "H2" // 증빙번호 중복 (D2 와 동일하지만 텍스트로 두 번 등장 케이스)
  | "I1" // 탭 소계 = 데이터 합
  | "I2" // 총괄표 ↔ 탭별 합계
  | "J1"; // PDF 링크 형식

/** 자동수정 가능한 카테고리들 — 셀 단위로 적용 */
export type AutofixKind =
  | "round-int" // A3 — 소수점 반올림해서 정수로
  | "vat-backward" // A4 — 합계 × 10/11 → 공급가액, 합계 - 공급가액 → 부가세
  | "trim" // G3 — 양끝 공백 제거
  | "swap-dates" // E2 — 사용·집행 일자 swap
  | "remove-x" // C1 — "X" / "FALSE" 마커 제거 (제안만, 사용자 확인)
  | "normalize-org" // G1 — 공식 기관명으로 교정
  | "normalize-payment"; // G2 — 지급방법 정규화

/** 셀 1개의 메타 + 값 */
export type AuditCell = {
  /** "F12" 형식 */
  address: string;
  rowIndex: number;
  colIndex: number;
  /** 원본 값 (xlsx 로드 시점) */
  original: CellValue;
  /** 현재 값 (편집 또는 자동수정 결과) */
  current: CellValue;
  /** 어떻게 변경됐는지 */
  editSource: "none" | "autofix" | "manual";
  /** 마지막 자동수정 종류 (원복용 표시) */
  lastAutofix?: AutofixKind;
};

export type CellValue = number | string | boolean | Date | null;

/** 시트 1개 */
export type AuditSheet = {
  /** 시트명 (탭 이름) */
  name: string;
  /** 비목 코드 추정 ("A-1", "C", "D-1-1" 등) */
  category: string;
  /** 표준 데이터 시트인지 (false면 검수데이터/원본/대시보드 등) */
  isStandardData: boolean;
  /** xlsx 상에서 숨김 시트인지 */
  hidden: boolean;
  /** 헤더 행 (1-based) — 없으면 0 */
  headerRow: number;
  /** 헤더 행의 컬럼 목록 (top + sub + key) */
  columns: SheetColumn[];
  /** 숨겨진 컬럼들 (Excel 컬럼 라벨 "G", "H" 등) */
  hiddenColumns: string[];
  /** 데이터 행 (헤더 다음부터, 소계/푸터 제외) */
  rows: AuditRow[];
  /** 시트 단위 issue (스키마 미스매치, 숨김 등) */
  issues: Issue[];
};

export type SheetColumn = {
  /** 0-based 컬럼 인덱스 */
  idx: number;
  /** 헤더 row 1 (top) */
  top: string;
  /** 헤더 row 2 (sub) */
  sub: string;
  /** 비교용 표준화 키 */
  key: string;
};

export type AuditRow = {
  rowIndex: number; // 1-based excel row
  /** key → cell. key 는 SheetColumn.key 사용 */
  cells: Record<string, AuditCell>;
};

export type Issue = {
  /** 자동 부여 ID */
  id: string;
  severity: IssueSeverity;
  category: IssueCategory;
  /** 사람이 읽는 메시지 */
  message: string;
  /** 시트명 (시트/셀 레벨이면 필수) */
  sheetName?: string;
  /** 셀 주소 ("F12") — 셀 레벨이면 필수 */
  cellAddress?: string;
  rowIndex?: number;
  colIndex?: number;
  /** 자동수정 가능하면 종류 */
  autofix?: AutofixKind;
  /** 자동수정 적용 후 예상 값 (UI 미리보기) */
  autofixPreview?: CellValue;
};

export type AuditWorkbook = {
  fileName: string;
  orgCode: OrgCode;
  sheets: AuditSheet[];
  /** 워크북 레벨 issue (잘못된 기관 추정 등) */
  issues: Issue[];
};

/** 검증 옵션 — 사용자 토글 */
export type AuditOptions = {
  enabledCategories: Record<IssueCategory, boolean>;
  /** 사업 기간 (E3 검증) — ISO 날짜 */
  projectPeriod: { start: string; end: string };
  /** 부가세 비율 — A4 검증 */
  vatRate: number;
  /** 지급방법 화이트리스트 — G2 */
  paymentMethods: string[];
  /** 공식 기관명 매핑 — G1 */
  officialOrgNames: { iportfolio: string; dimi: string; konkuk: string };
};

export const ALL_CATEGORIES: IssueCategory[] = [
  "A1", "A2", "A3", "A4", "A5",
  "B1", "B2",
  "C1", "C2",
  "D1", "D2", "D3",
  "E1", "E2", "E3",
  "F1", "F2", "F3", "F4",
  "G1", "G2", "G3", "G4",
  "H1", "H2",
  "I1", "I2",
  "J1",
];

export const CATEGORY_LABELS: Record<IssueCategory, string> = {
  A1: "공급가액+부가세=합계",
  A2: "합계=통장금액",
  A3: "소수점 정밀도",
  A4: "부가세 비율(1/11)",
  A5: "소계=합계",
  B1: "필수 필드 빈 값",
  B2: "증빙 Checklist 필수 빈 값",
  C1: "X/FALSE 마커",
  C2: "지출결의서 PDF 링크 누락",
  D1: "증빙번호 형식",
  D2: "증빙번호 중복",
  D3: "증빙번호 비순차",
  E1: "유효한 날짜",
  E2: "사용일자 ≤ 집행일자",
  E3: "사업 기간 안",
  F1: "표준 컬럼명 일치",
  F2: "누락된 표준 컬럼",
  F3: "엉뚱한 컬럼/시트 (제출용 아님)",
  F4: "숨겨진 컬럼/시트",
  G1: "공식 기관명",
  G2: "지급방법 화이트리스트",
  G3: "거래처명 공백",
  G4: "사용내역 형식",
  H1: "중복 행 (거래처+일자+금액)",
  H2: "증빙번호 중복",
  I1: "탭 소계=데이터 합",
  I2: "총괄표↔탭 합계",
  J1: "PDF 링크 형식",
};

/** 각 검증 카테고리의 「뭘 어떻게 검증하는지」 + 「예시」. 어드민/자료 단계 툴팁용. */
export const CATEGORY_DESCRIPTIONS: Record<
  IssueCategory,
  { what: string; example: string }
> = {
  A1: {
    what: "한 행의 공급가액 + 부가세 = 합계금액 인지 검증.",
    example: "공급가액 100,000 + 부가세 10,000 = 합계 110,000 ✓ / 합계가 109,000 이면 에러.",
  },
  A2: {
    what: "한 행의 합계금액 = 통장(지출) 금액 인지 검증. 실제 입금된 금액과 장부가 맞는지.",
    example: "합계 110,000 / 통장 110,000 ✓ / 통장 100,000 이면 에러 (수수료 미반영 등).",
  },
  A3: {
    what: "공급가액·부가세·합계·통장금액이 정수인지 검증. 소수점 있으면 표시·반올림 문제 발생.",
    example: "12,035.234 → 정수가 아님 → 자동수정으로 12,035 로 반올림 가능.",
  },
  A4: {
    what: "부가세 = 공급가액 × VAT% (기본 10%) 인지 검증. 1/11 backward 케이스 자동수정.",
    example: "공급가액 100,000 → 부가세 예상 10,000 / 입력 0 또는 9,091 이면 경고.",
  },
  A5: {
    what: "탭 소계(소계 행) = 데이터 행들의 합계 인지 검증.",
    example: "데이터 행 합 = 1,000,000 인데 소계 셀이 950,000 이면 누락/오기.",
  },
  B1: {
    what: "필수 필드(사용일자/거래처/합계/사용내역/증빙번호/집행기관) 빈 값 검증.",
    example: "거래처 셀이 비어있으면 에러. 「해당없음」 같은 placeholder 는 OK.",
  },
  B2: {
    what: "증빙 Checklist 의 필수 4항목(이체확인증/적격증빙/지출결의서 등) 빈 값 검증.",
    example: "필수 체크박스 4개 중 빈칸이 있으면 경고.",
  },
  C1: {
    what: "증빙 Checklist 셀에 「X」 또는 「FALSE」 마커가 있으면 미제출 의심.",
    example: "이체확인증 셀에 「X」 입력 → 자동수정으로 빈 값으로 비울 수 있음. 「O」/「해당없음」은 정상.",
  },
  C2: {
    what: "지출결의서 PDF 링크 컬럼이 비어있는지 검증 (제출 누락 방지).",
    example: "지출결의서 PDF 셀에 https://drive.google.com/... 링크가 없으면 경고.",
  },
  D1: {
    what: "증빙번호가 표준 형식 (예: D-1-1, F-1-23) 인지 검증.",
    example: "「D-1-1」 ✓ / 「d11」, 「D 1 1」, 「TEMP」 → 형식 의심 경고.",
  },
  D2: {
    what: "동일 증빙번호가 두 행 이상에 중복으로 등장하는지 검증.",
    example: "D-4-7 이 12행과 35행에 동시에 있으면 중복 에러.",
  },
  D3: {
    what: "증빙번호가 1, 2, 3, ... 순으로 연속되는지 검증 (정보성).",
    example: "D-4-1, D-4-2, D-4-4 → 3번 빠짐 (정보).",
  },
  E1: {
    what: "사용일자/집행일자가 진짜 Date 타입인지 검증. 텍스트로 입력되면 정렬·필터 깨짐.",
    example: "「2025. 5. 2 ~ 2025. 5. 9」 같은 텍스트면 경고. 셀 서식을 날짜로 변경 필요.",
  },
  E2: {
    what: "사용일자 ≤ 집행일자 인지 검증. 사용보다 집행이 먼저면 보통 입력 실수.",
    example: "사용 2025-08-15 / 집행 2025-08-10 → 자동 swap 가능.",
  },
  E3: {
    what: "사용일자가 사업기간(어드민에서 설정) 안에 있는지 검증.",
    example: "사업기간 2025-06-01 ~ 2026-05-31 / 사용일자 2025-05-30 → 기간 밖 경고.",
  },
  F1: {
    what: "헤더 컬럼명이 표준(스키마)과 일치하는지 검증.",
    example: "「공급액」 → 표준은 「공급가액」 → alias 매칭 실패 시 경고.",
  },
  F2: {
    what: "기관별 표준 시트/표준 컬럼 중 누락된 게 있는지 검증.",
    example: "아포폴 필수 시트 「F-1.일반관리비」가 워크북에 없으면 에러.",
  },
  F3: {
    what: "제출용 xlsx 에 검수데이터/원본/매칭/대시보드/사본/임시컬럼 등이 남아있는지 검증.",
    example: "「검수 데이터」 시트 또는 헤더 없는 「_col22」 컬럼 발견 시 경고.",
  },
  F4: {
    what: "Excel 에서 숨겨진(hidden) 시트/컬럼 검출. 제출 전 정리 필요.",
    example: "시트 가시성이 hidden / very hidden 이거나 컬럼 너비 0 으로 숨김 처리된 경우.",
  },
  G1: {
    what: "집행 기관명이 어드민에 설정한 공식 명칭과 정확히 일치하는지 검증.",
    example: "공식: 「(주)아이포트폴리오」 / 입력: 「아이포트폴리오」 → 자동 교정 가능.",
  },
  G2: {
    what: "지급방법이 화이트리스트(어드민 설정 — 기본 「카드」, 「계좌이체」)에 있는지 검증.",
    example: "「현금」 → 화이트리스트 밖 경고. 「카드」/「계좌이체」 ✓.",
  },
  G3: {
    what: "거래처 셀에 양끝 공백·제어문자가 있는지 검증. 검색·정렬 시 문제 유발.",
    example: "「 ㈜아이포트폴리오 」 → trim 자동수정 가능.",
  },
  G4: {
    what: "사용내역(수령인) 컬럼이 비목별 형식 패턴을 따르는지 검증.",
    example: "강사활용비 → 「1. 강사명(...) 2. 산출내역 ...」 패턴이 없으면 경고. (현재 비활성)",
  },
  H1: {
    what: "거래처 + 일자 + 금액이 동일한 행이 두 건 이상이면 이중 청구 의심.",
    example: "(주)A / 2025-08-15 / 110,000 이 두 행 → 같은 영수증 두 번 입력 가능성.",
  },
  H2: {
    what: "증빙번호가 텍스트 셀 안에 두 번 나타나는 케이스 (D2 보완).",
    example: "비고 셀에 「D-4-7 (D-4-7 재청구)」 같이 같은 번호 두 번 등장.",
  },
  I1: {
    what: "탭 안의 소계 행 값 = 데이터 행들의 합계 인지 검증 (A5 와 유사).",
    example: "F-1 데이터 합 1,000,000 / 소계 셀 950,000 이면 불일치.",
  },
  I2: {
    what: "총괄표 시트의 비목별 합계 = 각 비목 탭의 합계 인지 검증.",
    example: "총괄표 D-4 = 5,000,000 / D-4 시트 합계 = 4,800,000 → 불일치 경고.",
  },
  J1: {
    what: "PDF 링크 셀이 https://drive.google.com/... 형식의 정상 URL 인지 검증.",
    example: "「업로드 예정」 같은 텍스트나 깨진 URL 이면 경고.",
  },
};
