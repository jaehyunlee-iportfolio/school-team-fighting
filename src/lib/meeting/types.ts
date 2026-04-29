/**
 * 운영회의록(D-2) 도메인 타입.
 *
 * 한 회의 = 같은 (일시, 시간, 장소) 그룹.
 * CSV는 결제 단위로 row가 만들어지므로 한 회의가 N행으로 쪼개질 수 있고
 * 그 N행은 모두 같은 PDF 내용 + 다른 증빙번호로 N개의 PDF 파일로 출력된다.
 *
 * 그룹 내 행마다 안건/내용/결정사항/향후일정/작성자/참석자가 미세하게
 * 다를 수 있으므로 필드 단위로 후보값을 보존하고, 사용자가 검토/편집에서
 * "이 필드는 어떤 행의 값을 쓸지" 선택하거나 직접 입력할 수 있게 한다.
 */

/** 단일 필드: 후보값 + 선택 인덱스 + (선택 시) 직접 입력 오버라이드 */
export type MeetingFieldChoice = {
  /** 그룹의 각 증빙번호별로 추출된 후보값. value 가 비어있어도 기록(어느 행이 비었는지 추적). */
  candidates: { evidenceNo: string; value: string }[];
  /** candidates 중 선택된 인덱스. -1 이면 override 사용 */
  selectedIndex: number;
  /** 직접 입력값 (selectedIndex === -1 일 때 우선 적용) */
  override: string;
};

/** 효과적 값 (override 우선, 다음 selectedIndex 기준) */
export function effectiveValue(c: MeetingFieldChoice): string {
  if (c.selectedIndex === -1) return c.override;
  return c.candidates[c.selectedIndex]?.value ?? "";
}

/** 후보값들 중 서로 다른 게 있는가 (충돌 여부) */
export function hasConflict(c: MeetingFieldChoice): boolean {
  if (c.candidates.length <= 1) return false;
  const first = c.candidates[0]?.value ?? "";
  return c.candidates.some((x) => (x.value ?? "") !== first);
}

/** 1 그룹 = 1 PDF 내용 (파일은 그룹의 증빙번호 수만큼 사본 출력) */
export type MeetingOperationsRow = {
  rowIndex: number;
  /** 그룹 내 모든 증빙번호 (예: ["D-2-1","D-2-13"]) */
  evidenceNos: string[];
  /** 그룹 식별 키 (정규화된 일시|시간|장소) — 표시용 */
  groupKey: string;

  /** 본문 필드 — 모두 충돌 가능 */
  date: MeetingFieldChoice;        // 일시
  time: MeetingFieldChoice;        // 시간
  location: MeetingFieldChoice;    // 장소
  author: MeetingFieldChoice;      // 작성자
  agenda: MeetingFieldChoice;      // 회의 안건/목적
  content: MeetingFieldChoice;     // 회의 내용
  decisions: MeetingFieldChoice;   // 결정 및 협의사항
  schedule: MeetingFieldChoice;    // 향후 일정
  attendees: MeetingFieldChoice;   // 참석자 (콤마 구분 문자열)

  /** 파싱된 일시 — 파일명용 YYMMDD */
  dateY: string;
  dateM: string;
  dateD: string;
  dateYymmdd: string;

  /** 회의 그룹 단위 사진/영수증 첨부 (base64 dataURL) */
  photos: string[];

  /** 검증 */
  hasEmpty: boolean;
  fieldWarnings: string[];
};

/** 참석자 문자열 → 이름 배열 */
export function parseAttendees(s: string): string[] {
  if (!s) return [];
  return s
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean);
}
