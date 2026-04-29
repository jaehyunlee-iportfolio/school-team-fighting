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

  const out: ResumeRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r] ?? [];
    const name = get(cols, idx.name);
    // 성명이 비어있으면 건너뜀 (빈 행)
    if (!name) continue;

    const gubun = get(cols, idx.gubun);
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
    };
    out.push(recomputeWarnings(rowDraft));
  }
  return out;
}
