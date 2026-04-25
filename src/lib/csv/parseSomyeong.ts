import Papa from "papaparse";

export type SomyeongRow = {
  rowIndex: number;
  folderRaw: string;
  folders: string[];
  title: string;
  detail: string;
  attachments: string;
  seomok: string;
};

/**
 * 증빙폴더번호 문자열을 개별 폴더 목록으로 확장.
 * - "C-9"           → ["C-9"]
 * - "A-1-41, A-1-48"→ ["A-1-41", "A-1-48"]
 * - "A-1-21 ~ A-1-55" → ["A-1-21", "A-1-22", ..., "A-1-55"]
 */
export function expandFolders(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [""];

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

export function parseSomyeongCsv(text: string): SomyeongRow[] {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: false });
  const raw = result.data as string[][];
  if (!raw.length) return [];

  // 헤더 행 탐색
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

    // 건명도 폴더도 없으면 스킵
    if (!folderRaw && !title && !detail) continue;

    rows.push({
      rowIndex: i,
      folderRaw,
      folders: expandFolders(folderRaw),
      title,
      detail,
      attachments,
      seomok,
    });
  }

  return rows;
}
