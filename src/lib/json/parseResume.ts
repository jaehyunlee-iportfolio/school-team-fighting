// JSON 입력을 ResumeRow[]로 변환.
// 입력 JSON은 한국어 키 (사용자 친화). 내부 ResumeRow는 영문 키.

import {
  type ResumeRow,
  type CertificateItem,
  type LectureItem,
  type ProjectItem,
  type TrainingItem,
  emptyRow,
  recomputeWarnings,
} from "@/lib/resume/types";

type AnyObj = Record<string, unknown>;

function s(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function obj(v: unknown): AnyObj {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as AnyObj) : {};
}

function pick(o: AnyObj, ...keys: string[]): unknown {
  for (const k of keys) {
    if (k in o && o[k] !== undefined && o[k] !== null) return o[k];
  }
  return undefined;
}

function trainingItem(o: unknown): TrainingItem {
  const x = obj(o);
  return {
    name: s(pick(x, "연수명", "name")),
    period: s(pick(x, "기간/차시", "기간_차시", "기간차시", "기간", "period")),
    organizer: s(pick(x, "운영기관", "기관", "organizer")),
  };
}

function certItem(o: unknown): CertificateItem {
  const x = obj(o);
  return {
    name: s(pick(x, "자격증명", "name")),
    date: s(pick(x, "취득일자", "date")),
    issuer: s(pick(x, "발행기관", "issuer")),
  };
}

function lectureItem(o: unknown): LectureItem {
  const x = obj(o);
  return {
    name: s(pick(x, "연수명", "name")),
    period: s(pick(x, "기간/차시", "기간_차시", "기간차시", "기간", "period")),
    role: s(pick(x, "역할", "role")),
    organizer: s(pick(x, "연수 운영기관", "운영기관", "기관", "organizer")),
  };
}

function projectItem(o: unknown): ProjectItem {
  const x = obj(o);
  return {
    name: s(pick(x, "사업명", "name")),
    period: s(pick(x, "사업기간", "기간", "period")),
    role: s(pick(x, "역할", "role")),
    organization: s(pick(x, "기관", "organization")),
  };
}

function strList(v: unknown): string[] {
  return arr(v).map(s).filter((x) => x !== "");
}

function normalizeOne(input: unknown, rowIndex: number): ResumeRow {
  const x = obj(input);
  const basic = obj(pick(x, "기본정보", "basic"));
  const career = obj(pick(x, "경력", "career", "경력사항"));
  const teacher = obj(pick(career, "교사경력", "teacher"));
  const senior = obj(pick(career, "수석교사", "senior"));
  const trainings = obj(pick(x, "연수이수", "trainings"));
  const motivation = s(
    pick(x, "지원동기 및 포부", "지원동기", "motivation")
  );

  const row = emptyRow(rowIndex);
  row.basic = {
    name: s(pick(basic, "성명", "name")),
    gender: s(pick(basic, "성별", "gender")),
    birth: s(pick(basic, "생년월일", "birth")),
    organization: s(pick(basic, "소속", "organization")),
    position: s(pick(basic, "직위/직책", "직위_직책", "직위", "position")),
    subject: s(pick(basic, "담당교과", "subject")),
  };
  row.career = {
    teacherYears: s(pick(teacher, "근속연수", "years")),
    teacherDuties: strList(pick(teacher, "담당업무", "duties")),
    seniorYears: s(pick(senior, "근속연수", "years")),
    seniorDuties: strList(pick(senior, "담당업무", "duties")),
  };
  row.trainings = {
    digital: arr(pick(trainings, "디지털관련", "digital")).map(trainingItem),
    others: arr(pick(trainings, "기타", "others")).map(trainingItem),
  };
  row.certificates = arr(pick(x, "자격증", "certificates")).map(certItem);
  row.lectures = arr(pick(x, "교원대상강의", "lectures")).map(lectureItem);
  row.projects = arr(pick(x, "정부사업", "projects")).map(projectItem);
  row.motivation = motivation;

  return recomputeWarnings(row);
}

export function parseResumeJson(text: string): ResumeRow[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  // 배열 또는 { resumes: [...] } 둘 다 허용
  let list: unknown[];
  if (Array.isArray(parsed)) list = parsed;
  else if (parsed && typeof parsed === "object" && Array.isArray((parsed as AnyObj).resumes)) {
    list = (parsed as AnyObj).resumes as unknown[];
  } else if (parsed && typeof parsed === "object") {
    list = [parsed]; // 단일 객체도 허용
  } else {
    return [];
  }

  return list.map((item, i) => normalizeOne(item, i));
}
