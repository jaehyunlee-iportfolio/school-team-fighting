// 이력서(코디네이터/강사 지원서) 데이터 타입 — narrow CSV 모드.
//
// 입력 CSV 헤더(권장):
//   구분, 성명, 주민등록번호, 성별, 생년월일, 소속, 직위/직책,
//   지원 동기 및 포부 생성을 위해 필요한 자료, 연락처
//
// `구분` 칸이 "코디네이터"면 코디 양식, 그 외(빈칸 포함)는 강사 양식으로 라우팅.

export type ResumeKind = "coordinator" | "instructor";

export type ResumeBasic = {
  name: string;          // 성명
  rrn: string;           // 주민등록번호 (마스킹/표시 X — 양식 빈칸이 정상)
  gender: string;        // 성별
  birth: string;         // 생년월일
  organization: string;  // 소속
  position: string;      // 직위/직책
  subject: string;       // 담당교과 (CSV에 없음 → 빈칸)
};

export type ResumeAttachmentStatus =
  | "pending"
  | "extracting"
  | "ok"
  | "failed"
  | "skipped";

export type ResumeAttachment = {
  filename: string;
  size: number;
  status: ResumeAttachmentStatus;
  text?: string;       // 추출된 텍스트
  error?: string;      // 실패 시 사람이 읽을 사유
};

export type MotivationStatus =
  | "idle"        // 아직 생성 시도 X
  | "generating"  // 진행 중
  | "ok"          // 성공
  | "failed";     // 실패

export type ResumeRow = {
  rowIndex: number;
  kind: ResumeKind;
  gubun: string;          // 원본 「구분」 텍스트 (디버그/표시용)
  basic: ResumeBasic;
  contact: string;        // 연락처
  attachmentHint: string; // CSV의 「자료」 칸 원문 (파일명/링크/빈칸)
  attachments: ResumeAttachment[];
  motivation: string;     // AI 또는 사용자 직접 작성
  motivationStatus: MotivationStatus;
  motivationError?: string;
  hasEmpty: boolean;
  fieldWarnings: string[];
};

export function kindFromGubun(gubun: string): ResumeKind {
  return gubun.trim() === "코디네이터" ? "coordinator" : "instructor";
}

export function kindLabel(kind: ResumeKind): "코디" | "강사" {
  return kind === "coordinator" ? "코디" : "강사";
}

export function emptyAttachment(filename: string, size: number): ResumeAttachment {
  return { filename, size, status: "pending" };
}

export function emptyRow(rowIndex: number): ResumeRow {
  return {
    rowIndex,
    kind: "instructor",
    gubun: "",
    basic: {
      name: "",
      rrn: "",
      gender: "",
      birth: "",
      organization: "",
      position: "",
      subject: "",
    },
    contact: "",
    attachmentHint: "",
    attachments: [],
    motivation: "",
    motivationStatus: "idle",
    hasEmpty: false,
    fieldWarnings: [],
  };
}

export function recomputeWarnings(
  r: Omit<ResumeRow, "hasEmpty" | "fieldWarnings">,
): ResumeRow {
  const w: string[] = [];
  if (!r.basic.name.trim()) w.push("성명 누락");
  if (!r.basic.organization.trim()) w.push("소속 누락");
  if (!r.basic.position.trim()) w.push("직위/직책 누락");
  if (!r.contact.trim()) w.push("연락처 누락");
  if (!r.motivation.trim()) w.push("지원 동기 미작성");
  return { ...r, hasEmpty: w.length > 0, fieldWarnings: w };
}
