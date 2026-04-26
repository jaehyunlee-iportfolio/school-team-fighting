// CSV(wide format) → ResumeRow[]
//
// 한 행 = 한 사람. 반복 필드는 "디지털연수_1_연수명" 식으로 인덱스 접미.

import Papa from "papaparse";
import {
  type ResumeRow,
  type CertificateItem,
  type LectureItem,
  type ProjectItem,
  type TrainingItem,
  emptyRow,
  recomputeWarnings,
  MAX_TEACHER_DUTIES,
  MAX_TRAININGS,
  MAX_CERTIFICATES,
  MAX_LECTURES,
  MAX_PROJECTS,
} from "@/lib/resume/types";

function findColIdx(header: string[], patterns: RegExp[]): number {
  for (const re of patterns) {
    const i = header.findIndex((c) => re.test(c.trim()));
    if (i !== -1) return i;
  }
  return -1;
}

function findIndexedCols(header: string[], pattern: (i: number) => RegExp[], max: number): number[] {
  const out: number[] = [];
  for (let i = 1; i <= max; i++) {
    out.push(findColIdx(header, pattern(i)));
  }
  return out;
}

function getStr(row: string[], idx: number): string {
  if (idx < 0 || idx >= row.length) return "";
  return (row[idx] ?? "").trim();
}

function nonEmptyTraining(t: TrainingItem): boolean {
  return !!(t.name || t.period || t.organizer);
}
function nonEmptyCert(c: CertificateItem): boolean {
  return !!(c.name || c.date || c.issuer);
}
function nonEmptyLecture(l: LectureItem): boolean {
  return !!(l.name || l.period || l.role || l.organizer);
}
function nonEmptyProject(p: ProjectItem): boolean {
  return !!(p.name || p.period || p.role || p.organization);
}

export function parseResumeCsv(text: string): ResumeRow[] {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: false });
  const raw = (result.data as string[][]).filter((r) => r && r.length > 0);
  if (!raw.length) return [];

  // 헤더 행 찾기 (성명/이름 컬럼이 들어있는 첫 행, 최대 10행 안에서)
  let headerIdx = -1;
  for (let i = 0; i < Math.min(raw.length, 10); i++) {
    if (raw[i].some((c) => /^(성명|이름|name)$/i.test(c.trim()))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const header = raw[headerIdx];

  // 컬럼 인덱스 매핑
  const cols = {
    name: findColIdx(header, [/^성명$/, /^이름$/, /^name$/i]),
    gender: findColIdx(header, [/^성별$/, /^gender$/i]),
    birth: findColIdx(header, [/^생년월일$/, /^birth$/i]),
    org: findColIdx(header, [/^소속$/, /^organization$/i]),
    position: findColIdx(header, [/직위.*직책/, /^직위$/, /^position$/i]),
    subject: findColIdx(header, [/^담당교과$/, /^subject$/i]),
    teacherYears: findColIdx(header, [/교사경력.*근속연수/, /교사.*근속/]),
    seniorYears: findColIdx(header, [/수석교사.*근속연수/, /수석.*근속/]),
    motivation: findColIdx(header, [/^지원동기/, /^motivation$/i, /지원\s*동기/]),
  };
  const teacherDuties = findIndexedCols(
    header,
    (i) => [new RegExp(`교사경력_담당업무_${i}`), new RegExp(`교사.*담당.*${i}`)],
    MAX_TEACHER_DUTIES
  );
  const digitalCols = Array.from({ length: MAX_TRAININGS }, (_, i) => i + 1).map((i) => ({
    name: findColIdx(header, [new RegExp(`디지털연수_${i}_연수명`)]),
    period: findColIdx(header, [new RegExp(`디지털연수_${i}_기간차시`), new RegExp(`디지털연수_${i}_기간`)]),
    organizer: findColIdx(header, [new RegExp(`디지털연수_${i}_기관`)]),
  }));
  const otherCols = Array.from({ length: MAX_TRAININGS }, (_, i) => i + 1).map((i) => ({
    name: findColIdx(header, [new RegExp(`기타연수_${i}_연수명`)]),
    period: findColIdx(header, [new RegExp(`기타연수_${i}_기간차시`), new RegExp(`기타연수_${i}_기간`)]),
    organizer: findColIdx(header, [new RegExp(`기타연수_${i}_기관`)]),
  }));
  const certCols = Array.from({ length: MAX_CERTIFICATES }, (_, i) => i + 1).map((i) => ({
    name: findColIdx(header, [new RegExp(`자격증_${i}_자격증명`), new RegExp(`자격증_${i}_명`)]),
    date: findColIdx(header, [new RegExp(`자격증_${i}_취득일자`), new RegExp(`자격증_${i}_일자`)]),
    issuer: findColIdx(header, [new RegExp(`자격증_${i}_발행기관`), new RegExp(`자격증_${i}_기관`)]),
  }));
  const lectureCols = Array.from({ length: MAX_LECTURES }, (_, i) => i + 1).map((i) => ({
    name: findColIdx(header, [new RegExp(`강의경험_${i}_연수명`), new RegExp(`강의경험_${i}_명`)]),
    period: findColIdx(header, [new RegExp(`강의경험_${i}_기간차시`), new RegExp(`강의경험_${i}_기간`)]),
    role: findColIdx(header, [new RegExp(`강의경험_${i}_역할`)]),
    organizer: findColIdx(header, [new RegExp(`강의경험_${i}_기관`)]),
  }));
  const projectCols = Array.from({ length: MAX_PROJECTS }, (_, i) => i + 1).map((i) => ({
    name: findColIdx(header, [new RegExp(`정부사업_${i}_사업명`), new RegExp(`정부사업_${i}_명`)]),
    period: findColIdx(header, [new RegExp(`정부사업_${i}_기간`)]),
    role: findColIdx(header, [new RegExp(`정부사업_${i}_역할`)]),
    organization: findColIdx(header, [new RegExp(`정부사업_${i}_기관`)]),
  }));

  const rows: ResumeRow[] = [];
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const r = raw[i];
    const name = getStr(r, cols.name);
    const org = getStr(r, cols.org);
    if (!name && !org) continue; // 완전 빈 행은 스킵

    const row = emptyRow(i - headerIdx - 1);
    row.basic = {
      name,
      gender: getStr(r, cols.gender),
      birth: getStr(r, cols.birth),
      organization: org,
      position: getStr(r, cols.position),
      subject: getStr(r, cols.subject),
    };
    row.career = {
      teacherYears: getStr(r, cols.teacherYears),
      teacherDuties: teacherDuties.map((idx) => getStr(r, idx)).filter(Boolean),
      seniorYears: getStr(r, cols.seniorYears),
      seniorDuties: [],
    };
    row.trainings = {
      digital: digitalCols
        .map((c) => ({ name: getStr(r, c.name), period: getStr(r, c.period), organizer: getStr(r, c.organizer) }))
        .filter(nonEmptyTraining),
      others: otherCols
        .map((c) => ({ name: getStr(r, c.name), period: getStr(r, c.period), organizer: getStr(r, c.organizer) }))
        .filter(nonEmptyTraining),
    };
    row.certificates = certCols
      .map((c) => ({ name: getStr(r, c.name), date: getStr(r, c.date), issuer: getStr(r, c.issuer) }))
      .filter(nonEmptyCert);
    row.lectures = lectureCols
      .map((c) => ({
        name: getStr(r, c.name),
        period: getStr(r, c.period),
        role: getStr(r, c.role),
        organizer: getStr(r, c.organizer),
      }))
      .filter(nonEmptyLecture);
    row.projects = projectCols
      .map((c) => ({
        name: getStr(r, c.name),
        period: getStr(r, c.period),
        role: getStr(r, c.role),
        organization: getStr(r, c.organization),
      }))
      .filter(nonEmptyProject);
    row.motivation = getStr(r, cols.motivation);
    rows.push(recomputeWarnings(row));
  }

  return rows;
}
