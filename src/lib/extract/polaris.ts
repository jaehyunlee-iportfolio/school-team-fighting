// Polaris DataInsight API 로 hwp/hwpx/docx/pptx/xlsx 텍스트 추출.
//
// scripts/polaris-datainsight/extract.py 의 TypeScript 포팅.
// 서버 사이드에서만 사용 (process.env.POLARIS_DATAINSIGHT_API_KEY 필요).

import JSZip from "jszip";

const API_URL =
  "https://datainsight-api.polarisoffice.com/api/v1/datainsight/doc-extract";
const MAX_BYTES = 25 * 1024 * 1024;

const SUPPORTED = new Set([".hwp", ".hwpx", ".docx", ".pptx", ".xlsx"]);

export function isPolarisExt(filename: string): boolean {
  const i = filename.lastIndexOf(".");
  if (i < 0) return false;
  return SUPPORTED.has(filename.slice(i).toLowerCase());
}

type Cell = {
  para?: Array<{
    content?: Array<{ text?: string }>;
  }>;
  metrics?: {
    rowaddr?: number;
    coladdr?: number;
    rowspan?: number;
    colspan?: number;
  };
};

type Element = {
  type?: string;
  id?: string | number;
  content?: {
    text?: string;
    json?: Cell[];
  };
  structure?: { rows?: number; cols?: number };
};

type Page = {
  pageNum?: number | string;
  elements?: Element[];
};

type PolarisData = {
  pages?: Page[];
};

function cellText(cell: Cell): string {
  const paras = cell.para ?? [];
  const out: string[] = [];
  for (const p of paras) {
    for (const c of p.content ?? []) {
      if (c?.text) out.push(String(c.text));
    }
  }
  return out.join(" ").replace(/\n/g, " ").trim();
}

function tableToText(el: Element): string {
  const cells = el.content?.json ?? [];
  if (!cells.length) return "";
  let rows = el.structure?.rows ?? 0;
  let cols = el.structure?.cols ?? 0;
  if (!rows || !cols) {
    for (const c of cells) {
      const m = c.metrics ?? {};
      rows = Math.max(rows, (m.rowaddr ?? 0) + (m.rowspan ?? 1));
      cols = Math.max(cols, (m.coladdr ?? 0) + (m.colspan ?? 1));
    }
  }
  if (!rows || !cols) return "";
  const grid: string[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ""),
  );
  for (const c of cells) {
    const m = c.metrics ?? {};
    const r = m.rowaddr ?? 0;
    const co = m.coladdr ?? 0;
    if (r >= 0 && r < rows && co >= 0 && co < cols) {
      grid[r][co] = cellText(c);
    }
  }
  return grid.map((r) => r.filter(Boolean).join(" | ")).join("\n");
}

function collectText(data: PolarisData): string {
  const out: string[] = [];
  for (const page of data.pages ?? []) {
    for (const el of page.elements ?? []) {
      if (el.type === "text") {
        const t = el.content?.text;
        if (t) out.push(String(t));
      } else if (el.type === "table") {
        const t = tableToText(el);
        if (t) out.push(t);
      }
    }
  }
  return out.join("\n").normalize("NFC");
}

export async function extractWithPolaris(
  buf: Buffer | Uint8Array,
  filename: string,
): Promise<{ text: string }> {
  const apiKey = process.env.POLARIS_DATAINSIGHT_API_KEY;
  if (!apiKey) throw new Error("POLARIS_DATAINSIGHT_API_KEY 미설정");
  if (buf.byteLength > MAX_BYTES) {
    throw new Error(
      `파일이 25MB를 초과합니다 (${(buf.byteLength / 1024 / 1024).toFixed(1)}MB)`,
    );
  }
  if (!isPolarisExt(filename)) {
    throw new Error(`Polaris 미지원 확장자: ${filename}`);
  }

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)]), filename);

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "x-po-di-apikey": apiKey },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Polaris ${res.status}: ${body.slice(0, 300)}`);
  }
  const arrayBuf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuf);
  const jsonName = Object.keys(zip.files).find((k) =>
    k.toLowerCase().endsWith(".json"),
  );
  if (!jsonName) return { text: "" };
  const jsonText = await zip.files[jsonName].async("string");
  let data: PolarisData;
  try {
    data = JSON.parse(jsonText) as PolarisData;
  } catch {
    return { text: "" };
  }
  return { text: collectText(data) };
}
