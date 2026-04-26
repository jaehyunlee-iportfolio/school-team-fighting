/**
 * 출장복명서 업무내용·특이사항의 계층 불릿 파서.
 *
 * 형식:
 *   - 항목 구분: " | " (파이프)
 *   - 계층 표시: "-" 1개(depth 1), "--" 2개(depth 2), "---" 3개(depth 3)
 *
 * 예) "- 면담 개요 | -- 학교: 옹정초등학교 | -- 일시: 2025년 7월 8일 | - 참여인원 | -- 학교측: 곽현우 부장교사"
 */

export type BulletItem = {
  depth: number;
  text: string;
};

export function parseBullets(raw: string): BulletItem[] {
  if (!raw) return [];
  return raw
    .split("|")
    .map((s) => s.replace(/[\r\n]+/g, " ").trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(-+)\s*([\s\S]*)$/);
      if (!m) return { depth: 1, text: line };
      const depth = Math.min(m[1].length, 3);
      return { depth, text: m[2].trim() };
    })
    .filter((item) => item.text.length > 0);
}

/**
 * 다시 raw 문자열로 직렬화 (편집 다이얼로그 → 원본 형식으로 저장 시).
 */
export function serializeBullets(items: BulletItem[]): string {
  return items
    .map((item) => `${"-".repeat(Math.max(1, Math.min(item.depth, 3)))} ${item.text}`)
    .join(" | ");
}
