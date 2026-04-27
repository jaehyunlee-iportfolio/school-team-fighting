// xlsx 파일명에서 조직(ipf/dimi) 자동 인식.
// 출장신청서 detectGroupFromFilename 재사용 + 별표 prefix 등 추가 키워드 포괄.

import { detectGroupFromFilename } from "@/lib/approval/labels";
import type { ExpenseGroupCode } from "./types";

/**
 * 파일명에서 조직 코드 추출.
 * @returns "ipf" | "dimi" | null (자동 인식 실패)
 */
export function detectExpenseGroupFromFilename(
  filename: string
): ExpenseGroupCode | null {
  // 1차: 기존 detectGroupFromFilename — 디미 / 아이포트폴리오 등 키워드
  const r = detectGroupFromFilename(filename);
  if (r === "ipf" || r === "dimi") return r;

  // 2차: 한글 첫 글자 (별표 ★ prefix가 붙은 경우 — 아★, 디★)
  const t = filename.normalize("NFC");
  if (/(^|[^가-힣])아[★\s]/.test(t)) return "ipf";
  if (/(^|[^가-힣])디[★\s]/.test(t)) return "dimi";

  return null;
}
