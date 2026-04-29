// narrow format CSV → ResumeRow[]
//
// 한 행 = 한 사람. 헤더 매칭은 느슨하게(공백/특수문자 무시) 처리.

import Papa from "papaparse";
import {
  type ResumeRow,
  emptyRow,
  kindFromGubun,
  recomputeWarnings,
} from "@/lib/resume/types";

function norm(s: string): string {
  return (s || "").replace(/\s+/g, "").replace(/[·:/]/g, "");
}

function findIdx(header: string[], patterns: string[]): number {
  const normalized = header.map((h) => norm(h));
  for (const p of patterns) {
    const np = norm(p);
    const i = normalized.findIndex((h) => h === np || h.includes(np));
    if (i !== -1) return i;
  }
  return -1;
}

// 「지원 동기 및 포부 (본문)」 컬럼 찾기 — 「~ 생성을 위해 필요한 자료」 컬럼과 혼동 방지.
function findMotivationIdx(header: string[], excludeIdx: number): number {
  const normalized = header.map((h) => norm(h));
  for (let i = 0; i < normalized.length; i++) {
    if (i === excludeIdx) continue;
    const h = normalized[i];
    // 「자료/필요/생성」을 포함하면 attachmentHint 계열이라 제외
    if (h.includes("자료") || h.includes("필요") || h.includes("생성")) continue;
    if (
      h === "지원동기및포부" ||
      h === "지원동기" ||
      h === "포부" ||
      (h.includes("지원동기") && h.includes("포부"))
    ) {
      return i;
    }
  }
  return -1;
}

function get(row: string[], idx: number): string {
  if (idx < 0 || idx >= row.length) return "";
  return (row[idx] ?? "").trim();
}

export function parseResumeCsv(text: string): ResumeRow[] {
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
    transform: (v) => (typeof v === "string" ? v : String(v ?? "")),
  });
  const rows = result.data ?? [];
  if (!rows.length) return [];

  const header = rows[0] ?? [];
  const idx = {
    gubun: findIdx(header, ["구분"]),
    name: findIdx(header, ["성명", "이름"]),
    rrn: findIdx(header, ["주민등록번호", "주민번호"]),
    gender: findIdx(header, ["성별"]),
    birth: findIdx(header, ["생년월일"]),
    organization: findIdx(header, ["소속"]),
    position: findIdx(header, ["직위직책", "직위/직책", "직책", "직위"]),
    attachmentHint: findIdx(header, [
      "지원 동기 및 포부 생성을 위해 필요한 자료",
      "지원동기및포부생성을위해필요한자료",
      "자료",
      "참고자료",
      "필요한 자료",
    ]),
    contact: findIdx(header, ["연락처", "전화", "전화번호"]),
  };
  // 사전 입력된 「지원 동기 및 포부」 본문 컬럼 — 있으면 AI 호출 없이 그대로 사용.
  const motivationIdx = findMotivationIdx(header, idx.attachmentHint);

  const out: ResumeRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r] ?? [];
    const name = get(cols, idx.name);
    // 성명이 비어있으면 건너뜀 (빈 행)
    if (!name) continue;

    const gubun = get(cols, idx.gubun);
    const preMotivation = get(cols, motivationIdx);
    const base = emptyRow(out.length);
    const rowDraft = {
      ...base,
      gubun,
      kind: kindFromGubun(gubun),
      basic: {
        name,
        rrn: get(cols, idx.rrn),
        gender: get(cols, idx.gender),
        birth: get(cols, idx.birth),
        organization: get(cols, idx.organization),
        position: get(cols, idx.position),
        subject: "",
      },
      contact: get(cols, idx.contact),
      attachmentHint: get(cols, idx.attachmentHint),
      // 사전 입력본이 있으면 motivation 채우고 status=ok 로 — generateOneRow 가 건너뜀.
      motivation: preMotivation,
      motivationStatus: preMotivation ? ("ok" as const) : ("idle" as const),
    };
    out.push(recomputeWarnings(rowDraft));
  }
  return out;
}
