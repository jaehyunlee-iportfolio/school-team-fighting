/**
 * 학교명 정규화 + 매칭.
 * 비고("인천갈월초"), xlsx 시트("인천갈월초등학교"), 신청자 관리 CSV("인천갈월초등학교")
 * 사이의 표기 변형을 흡수해서 동일 학교를 찾는다.
 */

/** 공백·괄호·가운뎃점 등 잡문자 제거 */
function stripDecor(s: string): string {
  return s
    .normalize("NFC")
    .replace(/\s+/g, "")
    .replace(/[·・･ㆍ]/g, "")
    .replace(/[()（）\[\]【】]/g, "")
    // 학교명에 이런 후행 토큰이 붙어있을 수 있음 (예: "엄정초등학교(충주)" → 괄호 제거 후 "엄정초등학교충주")
    // 단순 학교명 추출을 위해 접미 식별자 제거는 하지 않는다 (후속 매칭에서 prefix로 흡수)
    .replace(/[，,]/g, "")
    .trim();
}

/** 약칭 → 풀이름 (마지막 토큰 기준) */
function expandSuffix(s: string): string {
  // "여중$" → "여자중학교"
  if (/여중$/.test(s)) return s.replace(/여중$/, "여자중학교");
  if (/여고$/.test(s)) return s.replace(/여고$/, "여자고등학교");
  if (/남중$/.test(s)) return s.replace(/남중$/, "남자중학교");
  if (/남고$/.test(s)) return s.replace(/남고$/, "남자고등학교");
  // 일반 약칭
  if (/초$/.test(s)) return s.replace(/초$/, "초등학교");
  if (/중$/.test(s)) return s.replace(/중$/, "중학교");
  if (/고$/.test(s)) return s.replace(/고$/, "고등학교");
  return s;
}

/** 풀이름 후보 정규형 */
export function normalizeSchoolName(raw: string): string {
  if (!raw) return "";
  const stripped = stripDecor(raw);
  return expandSuffix(stripped);
}

/** 약형 후보 (앞부분 매칭용) — "초등학교"/"중학교"/"고등학교" 접미 제거 */
function shortenSuffix(s: string): string {
  return s
    .replace(/여자중학교$/, "여중")
    .replace(/여자고등학교$/, "여고")
    .replace(/남자중학교$/, "남중")
    .replace(/남자고등학교$/, "남고")
    .replace(/초등학교$/, "초")
    .replace(/중학교$/, "중")
    .replace(/고등학교$/, "고");
}

/**
 * candidates 중에서 raw 와 매칭되는 학교 풀네임을 찾는다.
 * 1) 정규화 정확 일치
 * 2) raw 의 정규화가 candidate 의 정규화의 prefix
 * 3) candidate 의 short 형이 raw 의 정규화의 prefix
 * 모두 실패 시 null.
 */
export function findFullSchoolName(
  raw: string,
  candidates: string[],
): string | null {
  const normRaw = normalizeSchoolName(raw);
  if (!normRaw) return null;
  const normCands = candidates.map((c) => ({ raw: c, norm: normalizeSchoolName(c) }));

  // 1) exact
  const exact = normCands.find((c) => c.norm === normRaw);
  if (exact) return exact.raw;

  // 2) raw 가 candidate 의 prefix (예: raw "인천갈월초등학교" 가 "인천갈월초등학교" — 위와 동일하지만 안전망)
  const rawIsPrefix = normCands.find((c) => c.norm.startsWith(normRaw) && normRaw.length >= 3);
  if (rawIsPrefix) return rawIsPrefix.raw;

  // 3) short 형 — candidate 단축형이 raw 단축형의 prefix 또는 동일
  const shortRaw = shortenSuffix(normRaw);
  const shortMatch = normCands.find((c) => {
    const shortC = shortenSuffix(c.norm);
    return shortC === shortRaw || shortC.startsWith(shortRaw) || shortRaw.startsWith(shortC);
  });
  if (shortMatch) return shortMatch.raw;

  return null;
}
