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
