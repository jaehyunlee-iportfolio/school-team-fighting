/**
 * 운영회의록 CSV 파서.
 *
 * 헤더(가변 공백 허용):
 *   증빙번호 | 일 시 | 시 간 | 장 소 | 작성자 | 회의 안건 / 목적 |
 *   회의 내용 | 결정 및 협의사항 | 향후 일정 | 참석자
 *
 * 그룹 키: (정규화 일시 | 정규화 시간 | 정규화 장소).
 * 같은 그룹의 행들은 한 PDF 로 묶이고, 본문 필드들은 후보로 보존된다.
 */

import Papa from "papaparse";
import type {
  MeetingFieldChoice,
  MeetingOperationsRow,
} from "@/lib/meeting/types";

const ALIAS: Record<string, string[]> = {
  evidence: ["증빙번호"],
  date: ["일시", "일 시", "날짜"],
  time: ["시간", "시 간"],
  location: ["장소", "장 소"],
  author: ["작성자"],
  agenda: ["회의 안건", "안건", "회의 안건 / 목적", "회의안건/목적", "안건/목적", "회의 안건/목적", "목적"],
  content: ["회의 내용", "회의내용"],
  decisions: ["결정 및 협의사항", "결정및협의사항", "결정사항"],
  schedule: ["향후 일정", "향후일정"],
  attendees: ["참석자"],
};

function squish(s: string): string {
  return (s ?? "").replace(/\s+/g, "").toLowerCase();
}

function findCol(headers: string[], aliases: string[]): number {
  const ns = headers.map(squish);
  for (const a of aliases) {
    const na = squish(a);
    const exact = ns.findIndex((h) => h === na);
    if (exact >= 0) return exact;
    const partial = ns.findIndex((h) => h.includes(na));
    if (partial >= 0) return partial;
  }
  return -1;
}

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const r = rows[i] ?? [];
    if (r.some((c) => squish(c) === "증빙번호")) return i;
  }
  return -1;
}

/** 그룹 키 정규화 — 일시/시간/장소 모두 공백 제거 후 lower */
function normKey(date: string, time: string, location: string): string {
  return [date, time, location].map((s) => squish(s)).join("|");
}

/** "2025년 7월 28일", "2025-07-28", "2025/7/28" 등 → YYMMDD (실패 시 "") */
function parseYMD(raw: string): { y: string; m: string; d: string; yymmdd: string } {
  if (!raw) return { y: "", m: "", d: "", yymmdd: "" };
  let m = raw.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?/);
  if (!m) m = raw.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!m) m = raw.match(/(\d{2,4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!m) return { y: "", m: "", d: "", yymmdd: "" };
  const yi = parseInt(m[1], 10);
  const y = String(yi < 100 ? 2000 + yi : yi);
  const mo = String(parseInt(m[2], 10));
  const d = String(parseInt(m[3], 10));
  const yymmdd = `${y.slice(-2)}${mo.padStart(2, "0")}${d.padStart(2, "0")}`;
  return { y, m: mo, d, yymmdd };
}

function makeChoice(values: { evidenceNo: string; value: string }[]): MeetingFieldChoice {
  // 모든 후보값이 같으면 selectedIndex=0, 그렇지 않으면 첫 번째 비어있지 않은 값 우선
  let sel = 0;
  if (values.length > 0) {
    const firstNonEmpty = values.findIndex((v) => v.value.trim() !== "");
    if (firstNonEmpty >= 0) sel = firstNonEmpty;
  }
  return { candidates: values, selectedIndex: sel, override: "" };
}

export type MeetingParseResult = {
  rows: MeetingOperationsRow[];
  totalSourceRows: number;
};

export function parseMeetingOperationsCsv(text: string): MeetingParseResult {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const rows = (parsed.data as unknown as string[][]).filter(
    (r): r is string[] => Array.isArray(r),
  );
  const headerIdx = findHeaderRow(rows);
  if (headerIdx < 0) return { rows: [], totalSourceRows: 0 };

  const headers = rows[headerIdx];
  const c = {
    evidence: findCol(headers, ALIAS.evidence),
    date: findCol(headers, ALIAS.date),
    time: findCol(headers, ALIAS.time),
    location: findCol(headers, ALIAS.location),
    author: findCol(headers, ALIAS.author),
    agenda: findCol(headers, ALIAS.agenda),
    content: findCol(headers, ALIAS.content),
    decisions: findCol(headers, ALIAS.decisions),
    schedule: findCol(headers, ALIAS.schedule),
    attendees: findCol(headers, ALIAS.attendees),
  };
  if (c.evidence < 0) return { rows: [], totalSourceRows: 0 };

  type Raw = {
    evidence: string;
    date: string;
    time: string;
    location: string;
    author: string;
    agenda: string;
    content: string;
    decisions: string;
    schedule: string;
    attendees: string;
  };
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");

  const rawRows: Raw[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const ev = cell(r, c.evidence);
    if (!ev) continue;
    // 모든 필드가 텅 빈 행은 스킵 (예: "D-2-1,,,,,,,,,로 구분")
    const otherText = [c.date, c.time, c.location, c.author, c.agenda, c.content, c.decisions, c.schedule, c.attendees]
      .map((idx) => cell(r, idx))
      .filter(Boolean)
      .join("");
    if (!otherText) continue;
    rawRows.push({
      evidence: ev,
      date: cell(r, c.date),
      time: cell(r, c.time),
      location: cell(r, c.location),
      author: cell(r, c.author),
      agenda: cell(r, c.agenda),
      content: cell(r, c.content),
      decisions: cell(r, c.decisions),
      schedule: cell(r, c.schedule),
      attendees: cell(r, c.attendees),
    });
  }

  // 그룹화
  const order: string[] = [];
  const groups = new Map<string, Raw[]>();
  for (const r of rawRows) {
    const key = normKey(r.date, r.time, r.location);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(r);
  }

  // 각 그룹 → MeetingOperationsRow
  const out: MeetingOperationsRow[] = [];
  let idx = 0;
  for (const key of order) {
    const g = groups.get(key)!;
    const evNos = g.map((x) => x.evidence);
    const pick = (field: keyof Raw): MeetingFieldChoice =>
      makeChoice(g.map((x) => ({ evidenceNo: x.evidence, value: x[field] })));

    // 첫 후보 기준으로 일시 파싱
    const dateRaw = g[0]?.date ?? "";
    const ymd = parseYMD(dateRaw);

    const fieldWarnings: string[] = [];
    if (g.length > 1) {
      fieldWarnings.push(`결제 ${g.length}건이 같은 회의로 묶임 (${evNos.join(", ")})`);
    }
    if (!g[0]?.author) fieldWarnings.push("작성자 누락 — 내용 확인 필요");
    if (!ymd.yymmdd) fieldWarnings.push("일시 파싱 실패");
    if (!g[0]?.location) fieldWarnings.push("장소 누락");
    if (!g[0]?.attendees) fieldWarnings.push("참석자 누락");

    const row: MeetingOperationsRow = {
      rowIndex: idx++,
      evidenceNos: evNos,
      groupKey: key,
      date: pick("date"),
      time: pick("time"),
      location: pick("location"),
      author: pick("author"),
      agenda: pick("agenda"),
      content: pick("content"),
      decisions: pick("decisions"),
      schedule: pick("schedule"),
      attendees: pick("attendees"),
      dateY: ymd.y,
      dateM: ymd.m,
      dateD: ymd.d,
      dateYymmdd: ymd.yymmdd,
      photos: [],
      hasEmpty: !g[0]?.author || !g[0]?.location || !ymd.yymmdd,
      fieldWarnings,
    };
    out.push(row);
  }

  return { rows: out, totalSourceRows: rawRows.length };
}

/** 편집/선택 후 파일명용 YYMMDD 재계산을 위해 내보냄 */
export function reparseDateYMD(raw: string) {
  return parseYMD(raw);
}
