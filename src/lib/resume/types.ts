// 코디네이터 지원서 (이력서) 데이터 타입
//
// 사용자 입력은 한국어 키 JSON으로 받지만, 내부 처리는 영문 키로 통일.
// 변환은 parseResume.ts 에서 수행.

export type ResumeBasic = {
  name: string;          // 성명
  gender: string;        // 성별
  birth: string;         // 생년월일
  organization: string;  // 소속
  position: string;      // 직위/직책
  subject: string;       // 담당교과
};

export type ResumeCareer = {
  teacherYears: string;       // 교사경력 - 근속연수
  teacherDuties: string[];    // 교사경력 - 담당업무 (최대 5개)
  seniorYears: string;        // 수석교사 - 근속연수
  seniorDuties: string[];     // 수석교사 - 담당업무 (선택, 최대 5개)
};

export type TrainingItem = {
  name: string;        // 연수명
  period: string;      // 기간/차시
  organizer: string;   // 운영기관
};

export type ResumeTrainings = {
  digital: TrainingItem[]; // 디지털 관련 연수 이수 (최대 5개)
  others: TrainingItem[];  // 기타 연수 이수 (최대 5개)
};

export type CertificateItem = {
  name: string;        // 자격증명
  date: string;        // 취득일자
  issuer: string;      // 발행기관
};

export type LectureItem = {
  name: string;        // 연수명
  period: string;      // 기간/차시
  role: string;        // 역할
  organizer: string;   // 연수 운영기관
};

export type ProjectItem = {
  name: string;        // 사업명
  period: string;      // 사업기간
  role: string;        // 역할
  organization: string; // 기관
};

export type ResumeRow = {
  rowIndex: number;
  basic: ResumeBasic;
  career: ResumeCareer;
  trainings: ResumeTrainings;
  certificates: CertificateItem[];   // 최대 5개
  lectures: LectureItem[];           // 최대 5개
  projects: ProjectItem[];           // 최대 5개
  motivation: string;                // 지원 동기 및 포부
  hasEmpty: boolean;
  fieldWarnings: string[];
};

export const MAX_TEACHER_DUTIES = 5;
export const MAX_TRAININGS = 5;     // 각 카테고리별
export const MAX_CERTIFICATES = 5;
export const MAX_LECTURES = 5;
export const MAX_PROJECTS = 5;

export function emptyTraining(): TrainingItem {
  return { name: "", period: "", organizer: "" };
}
export function emptyCertificate(): CertificateItem {
  return { name: "", date: "", issuer: "" };
}
export function emptyLecture(): LectureItem {
  return { name: "", period: "", role: "", organizer: "" };
}
export function emptyProject(): ProjectItem {
  return { name: "", period: "", role: "", organization: "" };
}

export function emptyRow(rowIndex: number): ResumeRow {
  return {
    rowIndex,
    basic: { name: "", gender: "", birth: "", organization: "", position: "", subject: "" },
    career: { teacherYears: "", teacherDuties: [], seniorYears: "", seniorDuties: [] },
    trainings: { digital: [], others: [] },
    certificates: [],
    lectures: [],
    projects: [],
    motivation: "",
    hasEmpty: false,
    fieldWarnings: [],
  };
}

export function recomputeWarnings(r: Omit<ResumeRow, "hasEmpty" | "fieldWarnings">): ResumeRow {
  const w: string[] = [];
  if (!r.basic.name.trim()) w.push("「성명」이 비어 있어요");
  if (!r.basic.organization.trim()) w.push("「소속」이 비어 있어요");
  if (!r.basic.position.trim()) w.push("「직위/직책」이 비어 있어요");
  if (!r.career.teacherYears.trim() && !r.career.seniorYears.trim()) {
    w.push("「교사경력」 또는 「수석교사」 근속연수가 모두 비어 있어요");
  }
  if (!r.motivation.trim()) w.push("「지원 동기 및 포부」가 비어 있어요");
  return { ...r, hasEmpty: w.length > 0, fieldWarnings: w };
}
