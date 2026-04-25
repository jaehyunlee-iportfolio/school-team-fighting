import Papa from "papaparse";
import { SEOMOK_LIST } from "@/lib/firebase/firestore";

export type SomyeongRow = {
  rowIndex: number;
  folderRaw: string;
  folders: string[];
  title: string;
  detail: string;
  attachments: string;
  seomok: string;
  hasEmpty: boolean;
  fieldWarnings: string[];
};

/**
 * 증빙폴더번호 문자열을 개별 폴더 목록으로 확장.
 * - "C-9"           → ["C-9"]
 * - "A-1-41, A-1-48"→ ["A-1-41", "A-1-48"]
 * - "A-1-21 ~ A-1-55" → ["A-1-21", "A-1-22", ..., "A-1-55"]
 */
export function expandFolders(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.includes("~")) {
    const [leftStr, rightStr] = trimmed.split("~").map((s) => s.trim());
    const leftMatch = leftStr.match(/^(.*?)(\d+)$/);
    const rightMatch = rightStr.match(/(\d+)$/);
    if (leftMatch && rightMatch) {
      const prefix = leftMatch[1];
      const start = parseInt(leftMatch[2], 10);
      const end = parseInt(rightMatch[1], 10);
      if (!isNaN(start) && !isNaN(end) && end >= start) {
        return Array.from({ length: end - start + 1 }, (_, i) => `${prefix}${start + i}`);
      }
    }
    return [leftStr, rightStr].filter(Boolean);
  }

  return trimmed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function recomputeSomyeongWarnings(r: Omit<SomyeongRow, "hasEmpty" | "fieldWarnings">): SomyeongRow {
  const w: string[] = [];
  if (!r.folderRaw.trim()) w.push("「증빙폴더번호」가 비어 있어요");
  else if (r.folders.length === 0) w.push("「증빙폴더번호」를 폴더로 인식하지 못했어요");
  if (!r.title.trim()) w.push("「건명」이 비어 있어요");
  if (!r.detail.trim()) w.push("「상세내용」이 비어 있어요");
  if (!r.attachments.trim()) w.push("「첨부서류」가 비어 있어요");
  if (!r.seomok.trim()) w.push("「세목」이 비어 있어요 — N=0이 적용돼요");
  else if (!(SEOMOK_LIST as readonly string[]).includes(r.seomok))
    w.push(`알 수 없는 세목: "${r.seomok}" — N=0이 적용돼요`);
  return { ...r, hasEmpty: w.length > 0, fieldWarnings: w };
}

export function parseSomyeongCsv(text: string): SomyeongRow[] {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: false });
  const raw = result.data as string[][];
  if (!raw.length) return [];

  let headerIdx = -1;
  let colMap: Record<string, number> = {};

  const targets: [string, RegExp][] = [
    ["folder", /증빙폴더번호/],
    ["title", /건명/],
    ["detail", /상세내용/],
    ["attachments", /첨부서류/],
    ["seomok", /세목/],
  ];

  for (let i = 0; i < Math.min(raw.length, 10); i++) {
    const row = raw[i];
    const map: Record<string, number> = {};
    for (const [key, re] of targets) {
      const idx = row.findIndex((c) => re.test(c.trim()));
      if (idx !== -1) map[key] = idx;
    }
    if (map["folder"] !== undefined || map["title"] !== undefined) {
      headerIdx = i;
      colMap = map;
      break;
    }
  }

  if (headerIdx === -1) return [];

  const rows: SomyeongRow[] = [];
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const row = raw[i];
    const get = (key: string) => (colMap[key] !== undefined ? (row[colMap[key]] ?? "").trim() : "");

    const folderRaw = get("folder");
    const title = get("title");
    const detail = get("detail");
    const attachments = get("attachments");
    const seomok = get("seomok");

    if (!folderRaw && !title && !detail) continue;

    rows.push(
      recomputeSomyeongWarnings({
        rowIndex: i,
        folderRaw,
        folders: expandFolders(folderRaw),
        title,
        detail,
        attachments,
        seomok,
      })
    );
  }

  return rows;
}
