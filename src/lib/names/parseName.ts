const DATE_LIKE = /^\d{4}[-/]\d{1,2}/;
const MONEY_LIKE = /^[\d,.\s-]+(원)?$/i;

/**
 * "거래처" 첫 토큰(다인/구분자에서 맨 앞) — 작성자(기안) 후보
 */
export function firstTokenFromPartnerCell(raw: string | null | undefined): string {
  if (raw == null) return "";
  const s = raw
    .replace(/\r\n/g, "\n")
    .split(/\n/)[0]
    .trim();
  if (!s) return "";
  const parts = s
    .split(/[,/·∙•]/u)
    .map((p) => p.split(/\s+및\s+/u)[0].trim())
    .filter(Boolean);
  const first = parts[0] ?? "";
  if (first.length === 0) return "";
  if (DATE_LIKE.test(first) || (MONEY_LIKE.test(first) && /^\d/.test(first)))
    return "";
  return first;
}

const TRAVELER = /1\.\s*출장자명\s*[\(（]([^)）]+)[)）]/;

export function extractNameFromDetail(detail: string | null | undefined): string {
  if (!detail) return "";
  const m = TRAVELER.exec(detail.replace(/\r\n/g, "\n"));
  return m?.[1]?.trim() ?? "";
}

export function drafterSignatureGraphemes(name: string, max: number = 3): string {
  const t = (name || "").replace(/\s+/g, "").trim();
  if (!t) return "";
  return Array.from(t).slice(0, max).join("");
}

export function resolveWriterName(
  georae: string | null | undefined,
  detail: string | null | undefined
): { name: string; from: "georae" | "detail" | "none" } {
  const fromCell = firstTokenFromPartnerCell(georae);
  if (fromCell) return { name: fromCell, from: "georae" };
  const d = extractNameFromDetail(detail);
  if (d) return { name: d, from: "detail" };
  return { name: "", from: "none" };
}
