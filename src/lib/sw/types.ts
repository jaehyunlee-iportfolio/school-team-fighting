/**
 * 소프트웨어 활용 희망 요청서(D-3) 도메인 타입.
 */

export type SwLineItem = {
  /** 사용자(이름) — 기본은 학교 담당자, 사용자 검토 단계에서 수정 가능 */
  user: string;
  /** 품목명 및 규격 — 비고에서 추출 */
  product: string;
  /** 수량 — 비고에서 추출 (예: "2개") */
  quantity: string;
  /** 사용기간 — 비고/xlsx에서 추출 (예: "5개월") */
  period: string;
  /** 항목별 경고 (xlsx 미매칭 등) */
  warnings: string[];
};

export type SwRequestRow = {
  rowIndex: number;
  /** 증빙번호. ex) "D-3-2" */
  evidenceNo: string;
  /** D-3 비고에서 적힌 학교명 원본 (예: "인천갈월초") */
  schoolRaw: string;
  /** 정규화·매칭된 풀네임 (예: "인천갈월초등학교"). 매칭 실패 시 schoolRaw 그대로 */
  schoolName: string;
  /** 신청자 정보 표 — 담당자명 */
  applicantName: string;
  /** 신청자 정보 표 — 휴대폰 */
  applicantPhone: string;
  /** 신청자 정보 표 — 신청 대상 (기본 "교원") */
  applicantTarget: string;

  /** 견적일자 원본 텍스트 */
  quoteDateRaw: string;
  /** 파일명용 6자리 (YYMMDD), 실패 시 "" */
  quoteYymmdd: string;
  quoteY: string;
  quoteM: string;
  quoteD: string;

  items: SwLineItem[];

  hasEmpty: boolean;
  fieldWarnings: string[];
};

/** xlsx 견적서 시트 1장 분량 */
export type QuoteSheetItem = {
  product: string;
  quantity: string;   // 정수 문자열 (예: "2")
  period: string;     // 개월 문자열 (예: "5")
};

/** xlsx 시트의 사용자 명단 한 줄 (P14~) */
export type QuoteSheetUser = {
  name: string;
  phone: string;
  /** U열 텍스트 — "실제 구독일자(기간)" 헤더면 기간, "신청 에듀테크"면 SW명 (이때는 사용 안 함) */
  periodCell: string;
};

export type QuoteSheet = {
  /** 시트명 (= 학교명) */
  sheetName: string;
  /** 견적일자 원본 텍스트 (예: "2025 년 09 월 25 일") */
  quoteDateRaw: string;
  /** 좌측 견적서 표 (참고용) */
  items: QuoteSheetItem[];
  /** 우측 사용자 명단 (P14~). "예시" 행은 제외. */
  users: QuoteSheetUser[];
  /** U열 헤더가 "실제 …(기간)" 류면 true. "신청 에듀테크"면 false → 기간 컬럼 무시 */
  periodCellIsDate: boolean;
};

/** 학교 신청자 관리 CSV에서 추출된 학교 사전 1개 항목 */
export type SchoolApplicant = {
  fullName: string;        // CSV의 풀네임 (예: "인천갈월초등학교")
  applicantName: string;   // 첫 담당자명
  applicantPhone: string;  // 첫 휴대폰
};
