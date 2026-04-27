/**
 * 학교 신청자 관리 CSV 파서.
 * 구조: 1행 제목, 2~3행 메타, 4~5행 헤더(중복), 6행부터 데이터(중간 빈 row 가능).
 * 컬럼 인덱스: 1=학교명, 6=담당자명, 9=휴대폰
 */

import Papa from "papaparse";
import { normalizeSchoolName } from "@/lib/school/normalize";
import type { SchoolApplicant } from "@/lib/sw/types";

export type SchoolApplicantsResult = {
  /** key = normalizeSchoolName(fullName) */
  byNorm: Map<string, SchoolApplicant>;
  /** 풀네임 후보 리스트 (학교명 매칭에 사용) */
  fullNames: string[];
};

export function parseSchoolApplicantsCsv(text: string): SchoolApplicantsResult {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false });
  const rows: string[][] = (parsed.data as unknown as string[][]).filter(
    (r): r is string[] => Array.isArray(r),
  );

  const byNorm = new Map<string, SchoolApplicant>();
  const fullNames: string[] = [];

  // 데이터 시작: 6번째 row(인덱스 5)부터, 단 2번째 헤더 행도 R5(인덱스 4)임 — 실제 데이터는 인덱스 5+
  for (let i = 5; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const fullName = (row[1] ?? "").trim();
    if (!fullName) continue;

    const applicantName = (row[6] ?? "").trim();
    const applicantPhone = (row[9] ?? "").trim();

    const norm = normalizeSchoolName(fullName);
    if (!norm) continue;

    // 같은 학교 다수 행이면 첫 번째만 사용
    if (!byNorm.has(norm)) {
      byNorm.set(norm, {
        fullName,
        applicantName,
        applicantPhone,
      });
      fullNames.push(fullName);
    }
  }

  return { byNorm, fullNames };
}
